// webpack.config.js
//
// ARCHITECTURE NOTES — READ BEFORE EDITING:
//
// Why two separate config objects?
//   Chrome MV3 service workers run in a ServiceWorkerGlobalScope, NOT in a
//   browser window. Webpack's default target is 'web', which injects
//   references to `window`, `document`, and other DOM globals that do not
//   exist in a service worker. Setting target: 'webworker' on the background
//   entry strips all DOM polyfills and produces a clean, SW-compatible bundle.
//
// Why runtimeChunk: false + splitChunks: false on background?
//   Webpack's code-splitting emits a separate runtime chunk and shared vendor
//   chunks. A service worker must be a single self-contained file — it cannot
//   dynamically import sibling chunks at runtime (those imports would fail
//   silently because the SW has no HTML page to resolve relative URLs from).
//
// Why devtool: false in production?
//   MV3 enforces a strict Content Security Policy that forbids 'unsafe-eval'.
//   Any eval-based source map format (eval, eval-source-map, cheap-eval-*,
//   inline-source-map) causes Chrome to reject the extension at load time.
//   In development, 'cheap-module-source-map' is safe (no eval).
//   In production, disable source maps entirely or host them externally.
//
// Why "type": "module" removed from manifest.json?
//   Webpack's default output format is IIFE (classic script), not ES module.
//   If manifest declares "type": "module" but the file is an IIFE, Chrome
//   silently refuses to register the service worker.
//   Two options:
//     A) Keep IIFE output + no "type": "module" in manifest  ← chosen here
//     B) Use experiments.outputModule: true + "type": "module" in manifest
//   Option A is more stable across Webpack 5 minor versions.

'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

// ─── Shared module resolution ─────────────────────────────────────────────────
const sharedResolve = {
  extensions: ['.tsx', '.ts', '.js'],
  alias: {
    // Points to the pre-built dist of the shared-types workspace package.
    // If you switch to ts-paths or pnpm symlinks, update this accordingly.
    '@promty/shared-types': path.resolve(__dirname, '../../packages/shared-types/dist'),
  },
  fallback: {
    // Node.js built-ins — not available in browser/worker environments.
    // Setting false tells Webpack to emit an empty module instead of erroring.
    os: false,
    fs: false,
    path: false,
    crypto: false,
    buffer: false,
    stream: false,
    http: false,
    https: false,
    url: false,
  },
};

// ─── Shared loader rules ──────────────────────────────────────────────────────
const sharedRules = [
  {
    test: /\.tsx?$/,
    use: 'ts-loader',
    exclude: /node_modules/,
  },
  {
    // CSS is only needed by UI bundles (popup).
    // The background service worker never imports CSS.
    // Keeping this rule in both configs is harmless — ts-loader handles .ts/.tsx,
    // and the background entry has no CSS imports to process.
    test: /\.css$/,
    use: ['style-loader', 'css-loader', 'postcss-loader'],
  },
];

const isProd = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG 1 — UI bundles: popup + content script
//   target: 'web'  → standard browser environment (window, document available)
//   runtimeChunk / splitChunks: allowed here because popup.html loads
//   multiple <script> tags and can reference shared chunks.
//   If you want a single self-contained popup bundle, set runtimeChunk:false
//   and splitChunks:false here as well — simpler at the cost of duplication.
// ─────────────────────────────────────────────────────────────────────────────
const uiConfig = {
  name: 'ui',
  target: 'web',
  mode: isProd ? 'production' : 'development',

  // cheap-module-source-map: no eval → safe under MV3 CSP, fast rebuilds
  devtool: isProd ? false : 'cheap-module-source-map',

  entry: {
    popup: './src/popup/index.tsx',
    content: './src/content/index.ts',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    // Do NOT set clean: true here — the background config runs in parallel
    // (or sequentially) and would delete files emitted by the other config.
    // We handle cleanup via the background config's clean: true (it runs last).
    clean: false,
  },

  module: { rules: sharedRules },
  resolve: sharedResolve,

  optimization: {
    // Optional: extract shared vendor code into a separate chunk.
    // If you enable this, add the matching <script> tag to popup.html.
    // Disabled by default for simplicity.
    runtimeChunk: false,
    splitChunks: false,
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        // Static assets (icons, HTML pages, etc.)
        { from: 'public', to: '.' },
        // manifest.json lives at extension root, gets copied to dist/
        { from: 'manifest.json', to: '.' },
      ],
    }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG 2 — Background service worker
//   target: 'webworker' → ServiceWorkerGlobalScope (no window, no document)
//   runtimeChunk: false → single self-contained file (MANDATORY for SW)
//   splitChunks: false  → no dynamic chunk imports (MANDATORY for SW)
//   clean: true         → wipe dist/ before this config emits; safe because
//                         this config is declared last in the array and Webpack
//                         runs array configs sequentially in series mode,
//                         or you can set clean:false and run a pre-clean script.
//
// NOTE: If you run `webpack --parallel`, move clean:true to a separate
//       CleanWebpackPlugin and apply it only once. With default sequential
//       array execution this is fine as-is.
// ─────────────────────────────────────────────────────────────────────────────
const backgroundConfig = {
  name: 'background',

  // CRITICAL: 'webworker' prevents Webpack from referencing window/document,
  // which would throw ReferenceError inside a service worker at runtime.
  target: 'webworker',

  mode: isProd ? 'production' : 'development',
  devtool: isProd ? false : 'cheap-module-source-map',

  entry: {
    background: './src/background/index.ts',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    // Clean dist/ before emitting (runs after uiConfig because it's declared
    // second in the exported array — Webpack processes array configs in order).
    clean: true,
  },

  module: { rules: sharedRules },
  resolve: sharedResolve,

  optimization: {
    // MANDATORY for service workers:
    //   runtimeChunk: 'single' would emit a separate runtime-*.js file.
    //   The SW would need to importScripts() it, which requires extra setup.
    //   Keep false to inline the Webpack runtime into background.js itself.
    runtimeChunk: false,

    // MANDATORY for service workers:
    //   Any splitChunks config produces dynamic import() calls at runtime.
    //   SW cannot resolve these relative chunk URLs. Keep false.
    splitChunks: false,
  },

  // No CopyPlugin here — uiConfig already copies public/ and manifest.json.
  // Adding it again would cause a race condition in parallel builds.
};

// Export as an array — Webpack processes them sequentially by default.
// Order matters for the clean:true on backgroundConfig (runs second → safe).
module.exports = [uiConfig, backgroundConfig];
