import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-main)",
        card: "var(--bg-card)",
        surface: "var(--bg-surface)",
        accent: "var(--accent)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        textMain: "var(--text-main)",
        textMuted: "var(--text-muted)",
        borderSubtle: "var(--border-subtle)",
        borderWhite: "var(--border-white)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
export default config;
