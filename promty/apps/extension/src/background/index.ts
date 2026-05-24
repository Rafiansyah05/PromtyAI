/// <reference types="chrome" />

import { storage } from '../lib/storage';
import type { QuizState, QuizQuestion } from '@promty/shared-types';

console.log('[Promty] Background service worker started.');

// ─────────────────────────────────────────────────────────────────────────────
// SIDE PANEL — LIFECYCLE SETUP
//
// ARCHITECTURE CONTRACT:
//   • manifest.json MUST NOT have "action.default_popup"
//     → if default_popup exists, chrome.action.onClicked NEVER fires (Chrome
//       intercepts the click and renders the popup instead)
//   • manifest.json "background.type" MUST NOT be "module"
//     → Webpack outputs IIFE (classic script), not ES module.
//       Declaring "type":"module" causes Chrome to silently reject the SW.
//   • sidePanel.setOptions() MUST be called before sidePanel.open()
//     → Without it, open() silently fails on Chrome 110–115 (regression).
//   • sidePanel.open() REQUIRES a user-gesture context
//     → onClicked provides that. Never call it from a non-gesture path.
// ─────────────────────────────────────────────────────────────────────────────

// Register side panel path globally on install / update.
// This ensures the path is known to Chrome before any tab opens it.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setOptions({
      path: 'sidepanel.html',
      enabled: true,
    })
    .then(() => {
      console.log('[Promty] onInstalled: side panel path registered → sidepanel.html');
    })
    .catch((err) => {
      console.error('[Promty] onInstalled: sidePanel.setOptions failed:', err);
    });

  // Enable opening side panel natively on action click
  if (chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .then(() => {
        console.log('[Promty] onInstalled: setPanelBehavior configured');
      })
      .catch((err) => {
        console.error('[Promty] onInstalled: setPanelBehavior failed:', err);
      });
  }
});

// Also register on service worker startup (handles SW revival after Chrome
// terminates it — onInstalled does NOT fire on revival).
chrome.sidePanel
  .setOptions({
    path: 'sidepanel.html',
    enabled: true,
  })
  .catch((err) => {
    console.warn('[Promty] Startup: sidePanel.setOptions failed:', err);
  });

if (chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => {
      console.warn('[Promty] Startup: setPanelBehavior failed:', err);
    });
}

// Note: onClicked listener is removed to avoid conflict with setPanelBehavior
// which natively opens the side panel on extension icon click.
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function safeSendMessage(tabId: number, message: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (res) => {
        if (chrome.runtime.lastError) {
          console.warn(`[Msg] ${message.type} failed:`, chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(res);
        }
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function awaitTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (tid: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tid === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Safety timeout: 10 seconds max wait
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 10_000);
  });
}

// Execute a function directly inside a tab using chrome.scripting.executeScript.
// Far more reliable than sendMessage for one-shot DOM operations — does not
// require a content script to be already injected and listening.
async function execInTab(tabId: number, func: () => any): Promise<any> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
    });
    return results?.[0]?.result ?? null;
  } catch (e) {
    console.warn('[execInTab] Failed:', e);
    return null;
  }
}

// Extract a balanced JSON object from freeform text.
// Handles: nested braces, markdown code fences, trailing commas, JS comments.
function extractJsonFromText(text: string): any | null {
  if (!text) return null;

  // ── Pass 1: collect all balanced curly-brace blocks ──
  const candidates: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      let depth = 0;
      let endIdx = -1;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '{') depth++;
        if (text[j] === '}') depth--;
        if (depth === 0) {
          endIdx = j;
          break;
        }
      }
      if (endIdx !== -1) candidates.push(text.substring(i, endIdx + 1));
    }
  }

  // ── Pass 2: search candidates from last (longest/deepest) to first ──
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (!candidate.includes('"answers"')) continue;

    // Try raw parse first, then with cleanup
    for (const clean of [candidate, sanitizeJson(candidate)]) {
      try {
        const parsed = JSON.parse(clean);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        /* keep searching */
      }
    }
  }

  // ── Pass 3: broad first-open → last-close fallback ──
  const firstOpen = text.indexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose > firstOpen) {
    const candidate = text.substring(firstOpen, lastClose + 1);
    if (candidate.includes('"answers"')) {
      for (const clean of [candidate, sanitizeJson(candidate)]) {
        try {
          const parsed = JSON.parse(clean);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch {
          /* no-op */
        }
      }
    }
  }

  return null;
}

function sanitizeJson(s: string): string {
  return s
    .replace(/,\s*([\]}])/g, '$1') // trailing commas
    .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1'); // JS comments
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ SOLVER ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

async function startQuizSolver(provider: string): Promise<void> {
  let lmsTabId = 0;
  let lmsUrl = '';

  try {
    // ── STEP 1: Validate LMS tab ─────────────────────────────────────────────
    // Use lastFocusedWindow to avoid returning the extension popup/panel itself
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let lmsTab = tabs[0];
    if (!lmsTab) {
      const allActive = await chrome.tabs.query({ active: true });
      lmsTab = allActive[0];
    }
    if (!lmsTab?.id) {
      console.error('[Promty] No active LMS tab found');
      return;
    }

    lmsTabId = lmsTab.id;
    lmsUrl = lmsTab.url || '';

    const isMoodleQuiz = lmsUrl.includes('/mod/quiz/');
    if (!isMoodleQuiz) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Promty AI',
        message: 'Buka halaman kuis LMS Telkom University / Moodle dulu!',
      });
      await storage.set('quizState', null);
      return;
    }

    let state: QuizState = {
      status: 'extracting',
      aiProvider: provider as any,
      questions: [],
      answers: {},
      currentLmsTabId: lmsTabId,
    };
    await storage.set('quizState', state);
    console.log('[1/5] Scraping LMS quiz pages...');

    // ── STEP 2: Scrape all pages ──────────────────────────────────────────────
    let hasNext = true;
    while (hasNext) {
      const cur = await storage.get('quizState');
      if (!cur || cur.status === 'idle') return;

      const res = (await safeSendMessage(lmsTabId, { type: 'SCRAPE_LMS' })) || {
        questions: [],
        hasNext: false,
        hasFinish: false,
        hasStartBtn: false,
      };

      if (res.questions.length === 0 && res.hasStartBtn) {
        await safeSendMessage(lmsTabId, { type: 'CLICK_START_QUIZ' });
        await new Promise((r) => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        const t = await chrome.tabs.get(lmsTabId);
        lmsUrl = t.url || lmsUrl;
        continue;
      }

      const newQs = res.questions.filter((nq: QuizQuestion) => !state.questions.some((q) => q.id === nq.id));
      state.questions = [...state.questions, ...newQs];
      await storage.set('quizState', state);

      hasNext = res.hasNext;
      if (hasNext) {
        await safeSendMessage(lmsTabId, { type: 'CLICK_NEXT_LMS' });
        await new Promise((r) => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        const t = await chrome.tabs.get(lmsTabId);
        lmsUrl = t.url || lmsUrl;
      }
    }

    console.log(`[2/5] Scraped ${state.questions.length} questions.`);
    if (state.questions.length === 0) {
      await storage.set('quizState', null);
      return;
    }

    // ── STEP 3: Build prompt and send to AI ───────────────────────────────────
    state.status = 'waiting_ai';
    await storage.set('quizState', state);

    let formattedQuestions = '';
    state.questions.forEach((q, idx) => {
      const num = idx + 1;
      formattedQuestions += `\n`;
      formattedQuestions += `════════════════════════════════\n`;
      formattedQuestions += `SOAL NOMOR ${num} (dari ${state.questions.length})\n`;
      formattedQuestions += `════════════════════════════════\n`;
      formattedQuestions += `[CONTAINER_ID]: ${q.id}\n`;
      formattedQuestions += `[PERTANYAAN]: ${q.text}\n`;

      const isTextInput = q.options.length === 1 && q.options[0].text === '[isian]';
      if (isTextInput) {
        formattedQuestions += `[TIPE SOAL]: TIPE ISIAN (Short Answer / Fill-in-the-blank / Essay)\n`;
        formattedQuestions += `  PENTING: Soal ini tidak memiliki pilihan ganda. Tentukan kata/frasa/angka jawaban yang paling tepat secara mandiri melalui pencarian web. Tuliskan jawaban teks singkat/angka yang tepat secara langsung (misal: "Buku Gambar" atau "Looping" atau "120") sebagai VALUE pada key "${q.id}" di dalam objek "answers" dan "selected_option_id".\n`;
      } else {
        formattedQuestions += `[PILIHAN JAWABAN]:\n`;
        q.options.forEach((opt, optIdx) => {
          const letter = String.fromCharCode(65 + optIdx);
          formattedQuestions += `  ${letter}. ${opt.text}\n`;
          formattedQuestions += `     └─ OPTION_ID: "${opt.id}"\n`;
        });
      }
    });

    const exampleKey = state.questions[0]?.id || 'question-xxx-1';
    const exampleVal = state.questions[0]?.options[0]?.id || 'qXXX:1_answer0';
    const exampleText = state.questions[0]?.options[0]?.text || 'Teks jawaban pilihan A';

    const systemPrompt = `Kamu adalah pakar akademis tercerdas di dunia dengan kemampuan analitis tingkat tinggi. Tugas kamu adalah memecahkan ${state.questions.length} soal kuis universitas dengan AKURASI MUTLAK (TARGET NILAI 100/100).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PENTING — AKTIFKAN BROWSING / INTERNET SEARCH:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sebelum menjawab, kamu WAJIB menggunakan fitur pencarian web (Web Search / Search the web / internet search) secara aktif untuk mencari materi kuliah, slide, dokumentasi resmi, atau literatur tepercaya terkait dari setiap soal. Jangan menebak! Pastikan jawaban diverifikasi oleh sumber tepercaya di internet agar mendapatkan nilai 100/100.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PENTING — DETAIL ANALISIS & JAWABAN:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sistem parser membutuhkan detail analisis yang lengkap di dalam struktur JSON agar dapat memproses setiap opsi jawaban secara optimal dan meminimalkan kesalahan. Oleh karena itu, kamu harus mengembalikan satu blok JSON di paling akhir respon dengan format sangat detail seperti di bawah ini.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAT OUTPUT JSON DETAIL (WAJIB):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tulis jawaban akhirmu di bagian paling bawah respon dalam blok \`\`\`json seperti berikut:

\`\`\`json
{
  "total_questions": ${state.questions.length},
  "detailed_analysis": {
    "${exampleKey}": {
      "question_number": 1,
      "topic": "Isi dengan topik/kategori soal",
      "search_queries_used": ["kueri pencarian yang digunakan di internet"],
      "thinking_process": "Penjelasan detail step-by-step mengapa jawaban ini benar, membandingkan opsi lainnya dengan teliti berdasarkan pencarian internet",
      "selected_letter": "A",
      "selected_option_text": "${exampleText}",
      "selected_option_id": "${exampleVal}",
      "confidence_score": "100%"
    }
  },
  "answers": {
    "${exampleKey}": "${exampleVal}"
  },
  "answer_letters": {
    "${exampleKey}": "A"
  },
  "answer_texts": {
    "${exampleKey}": "${exampleText}"
  }
}
\`\`\`

ATURAN KRITIS (WAJIB DIIKUTI):
• Gunakan CONTAINER_ID sebagai KEY pada bagian "answers", "answer_letters", "answer_texts", dan "detailed_analysis".
• Untuk SOAL PILIHAN GANDA: Di dalam "answers" dan "selected_option_id", gunakan OPTION_ID pilihan yang benar sebagai VALUE — salin karakter-per-karakter secara persis. Di dalam "answer_letters" dan "selected_letter", masukkan huruf pilihan jawaban yang benar (A, B, C, D, atau E). Di dalam "answer_texts" dan "selected_option_text", masukkan teks lengkap dari pilihan jawaban tersebut.
• Untuk SOAL TIPE ISIAN (Short Answer/Essay/Numeric): Di dalam "answers", "selected_option_id", "answer_texts", dan "selected_option_text", masukkan kata/frasa/angka jawaban singkat yang benar secara langsung sebagai VALUE (misal: "Buku Gambar" atau "Looping" atau "15"). Di dalam "answer_letters" dan "selected_letter", masukkan "ISIAN".
• JANGAN ada soal yang terlewat! Semua ${state.questions.length} soal HARUS dianalisis secara mendalam dan tercantum di dalam JSON.
• Blok \`\`\`json harus diletakkan di paling akhir setelah analisis teks biasa kamu.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAFTAR SOAL DAN PILIHAN LENGKAP:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formattedQuestions}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gunakan penelusuran web sekarang untuk memecahkan setiap soal di atas secara berurutan. Berikan analisis teks biasa terlebih dahulu, kemudian tutup dengan blok \`\`\`json detail di atas.`;

    console.log(`[3/5] Prompt length: ${systemPrompt.length} chars, covering ${state.questions.length} questions`);

    let aiUrl = 'https://chatgpt.com';
    if (provider === 'claude') aiUrl = 'https://claude.ai';
    if (provider === 'gemini') aiUrl = 'https://gemini.google.com/app';
    if (provider === 'deepseek') aiUrl = 'https://chat.deepseek.com';

    console.log(`[3/5] Opening AI tab: ${aiUrl}`);
    const aiTab = await chrome.tabs.create({ url: aiUrl });
    if (!aiTab?.id) throw new Error('Failed to open AI tab');
    const aiTabId = aiTab.id;
    state.currentAiTabId = aiTabId;
    await storage.set('quizState', state);

    await awaitTabLoad(aiTabId);
    await new Promise((r) => setTimeout(r, 2000)); // let SPA fully hydrate

    // ── Inject prompt (platform-aware) ───────────────────────────────────────
    console.log('[3/5] Injecting prompt into AI editor...');
    await chrome.scripting.executeScript({
      target: { tabId: aiTabId },
      func: (prompt: string) => {
        const host = window.location.hostname;
        let el: HTMLElement | null = null;

        if (host.includes('chatgpt.com')) {
          el = document.querySelector('#prompt-textarea') as HTMLElement;
        } else if (host.includes('claude.ai')) {
          el = document.querySelector('div.ProseMirror[contenteditable="true"]') as HTMLElement;
          if (!el) el = document.querySelector('[contenteditable="true"]') as HTMLElement;
        } else if (host.includes('gemini.google.com')) {
          const rt = document.querySelector('rich-textarea');
          if (rt) el = rt.querySelector('[contenteditable="true"]') as HTMLElement;
          if (!el) el = document.querySelector('.ql-editor[contenteditable="true"]') as HTMLElement;
          if (!el) el = document.querySelector('[contenteditable="true"]') as HTMLElement;
        } else if (host.includes('deepseek.com')) {
          el = document.querySelector('textarea#chat-input') as HTMLElement;
          if (!el) el = document.querySelector('textarea[placeholder]') as HTMLElement;
          if (!el) el = document.querySelector('textarea') as HTMLElement;
          if (!el) el = document.querySelector('[contenteditable="true"]') as HTMLElement;
        } else {
          el = (document.querySelector('textarea') as HTMLElement) || (document.querySelector('[contenteditable="true"]') as HTMLElement);
        }

        if (!el) {
          console.error('[Promty] No editor element found');
          return false;
        }

        el.focus();
        let inserted = false;

        // Method 1: execCommand — best for contenteditable / Lexical / ProseMirror
        if (el.isContentEditable) {
          try {
            document.execCommand('selectAll', false, undefined);
            inserted = document.execCommand('insertText', false, prompt);
          } catch {
            /* fall through */
          }

          if (!inserted) {
            el.innerHTML = `<p>${prompt}</p>`;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            inserted = true;
          }
        }

        // Method 2: native value setter for <textarea>
        if (!inserted && 'value' in el) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(el, prompt);
          else (el as any).value = prompt;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          inserted = true;
        }

        // Method 3: last resort innerText
        if (!inserted) {
          el.innerText = prompt;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
      },
      args: [systemPrompt],
    });

    // ── Click send button (with retry) ───────────────────────────────────────
    console.log('[3/5] Clicking send button...');
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 500));

      const clicked = await chrome.scripting.executeScript({
        target: { tabId: aiTabId },
        func: () => {
          const host = window.location.hostname;
          let selectors: string[] = [];

          if (host.includes('chatgpt.com')) {
            selectors = ['button[data-testid="send-button"]', 'button[data-testid="fruitjuice-send-button"]'];
          } else if (host.includes('claude.ai')) {
            selectors = ['button[aria-label="Send Message"]', 'button[aria-label="Send message"]', 'button[aria-label="Send Prompt"]', 'fieldset button:not([aria-label="Attach files"])'];
          } else if (host.includes('gemini.google.com')) {
            selectors = ['button[aria-label="Send message"]', 'button[aria-label="Send Message"]', 'button.send-button', '.input-area-container button.send'];
          } else if (host.includes('deepseek.com')) {
            selectors = ['button[aria-label="Send"]', 'button[aria-label="Send message"]', '#ds-chat-input-btn', 'div.ds-chat-input-footer button:not([disabled])', 'textarea ~ button'];
          }

          selectors.push('button[type="submit"]', 'form button:last-of-type');

          for (const sel of selectors) {
            try {
              const btn = document.querySelector(sel) as HTMLElement;
              if (btn && !btn.hasAttribute('disabled') && !btn.classList.contains('disabled')) {
                btn.click();
                return true;
              }
            } catch {
              /* invalid selector */
            }
          }

          // SVG aria-label fallback
          for (const btn of Array.from(document.querySelectorAll('button'))) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const testid = (btn.getAttribute('data-testid') || '').toLowerCase();
            if ((label.includes('send') || testid.includes('send')) && !btn.hasAttribute('disabled')) {
              btn.click();
              return true;
            }
          }
          return false;
        },
      });

      if (clicked?.[0]?.result === true) {
        console.log('[3/5] Send button clicked successfully.');
        break;
      }

      // Last resort: simulate Enter key
      if (attempt === 9) {
        console.warn('[3/5] Falling back to Enter key...');
        await chrome.scripting.executeScript({
          target: { tabId: aiTabId },
          func: () => {
            const el = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
            if (el) {
              el.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                }),
              );
            }
          },
        });
      }
    }

    // ── STEP 4: Poll AI for completion ────────────────────────────────────────
    console.log('[4/5] Waiting for AI to finish generating...');

    let prevTextLength = 0;
    let stableChecks = 0;
    let aiDone = false;

    // Poll every 2 s, up to 5 min (150 × 2 s = 300 s)
    for (let attempt = 0; attempt < 150; attempt++) {
      const status = (await execInTab(aiTabId, () => {
        const host = window.location.hostname;
        let stopButtonActive = false;

        if (host.includes('chatgpt.com')) {
          stopButtonActive = !!document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]');
        } else if (host.includes('claude.ai')) {
          stopButtonActive = !!document.querySelector('button[aria-label="Stop Response"], button[aria-label="Stop generating"], [data-is-streaming="true"]');
        } else if (host.includes('gemini.google.com')) {
          stopButtonActive = !!document.querySelector('button[aria-label="Stop generation"], button[aria-label="Stop"], button[aria-label="Cancel"]');
        } else if (host.includes('deepseek.com')) {
          stopButtonActive = !!document.querySelector('button .ds-icon-stop, button[aria-label="Stop"], button[title="Stop"]') || !!document.querySelector('.ds-loading, .ds-loading-spinner, .ds-loading-bar');
        }

        let text = '';

        if (host.includes('chatgpt.com')) {
          const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
          if (msgs.length) text = msgs[msgs.length - 1].textContent || '';
          if (!text) {
            const prose = document.querySelectorAll('.markdown.prose');
            if (prose.length) text = prose[prose.length - 1].textContent || '';
          }
        } else if (host.includes('claude.ai')) {
          for (const sel of ['[data-is-streaming]', '.font-claude-message', '.prose', '[class*="response"]']) {
            const msgs = document.querySelectorAll(sel);
            if (msgs.length) {
              const c = msgs[msgs.length - 1].textContent || '';
              if (c.length > text.length) text = c;
            }
          }
        } else if (host.includes('gemini.google.com')) {
          for (const sel of ['.model-response-text', '.response-container', '.message-content', 'message-content', '.markdown-main-panel', '[data-content-type="response"]']) {
            const msgs = document.querySelectorAll(sel);
            if (msgs.length) {
              const c = msgs[msgs.length - 1].textContent || '';
              if (c.length > text.length) text = c;
            }
          }
        } else if (host.includes('deepseek.com')) {
          for (const sel of ['.ds-markdown--block', '.ds-markdown', '.ds-message-item .ds-markdown', '[class*="assistant"] [class*="markdown"]', '[class*="message"] [class*="markdown"]', 'pre', '[class*="content"]']) {
            try {
              const msgs = document.querySelectorAll(sel);
              if (msgs.length) {
                const c = msgs[msgs.length - 1].textContent || '';
                if (c.length > text.length) text = c;
              }
            } catch {
              /* invalid selector */
            }
          }
          const codeBlocks = document.querySelectorAll('pre code, pre');
          for (let i = codeBlocks.length - 1; i >= 0; i--) {
            const t = codeBlocks[i].textContent || '';
            if (t.includes('"answers"')) {
              text = t;
              break;
            }
          }
        }

        // Universal fallback — scan code blocks for answers JSON
        if (!text || !text.includes('"answers"')) {
          const blocks = document.querySelectorAll('pre, code, .code-block');
          for (let i = blocks.length - 1; i >= 0; i--) {
            const t = blocks[i].textContent || '';
            if (t.includes('"answers"')) {
              text = t;
              break;
            }
          }
        }
        if (!text) {
          const all = document.querySelectorAll('div, section, article, p');
          for (let i = all.length - 1; i >= 0; i--) {
            const t = all[i].textContent || '';
            if (t.length > text.length) text = t;
          }
        }

        return { stopButtonActive, text };
      })) || { stopButtonActive: false, text: '' };

      const textLength = (status.text || '').length;
      let hasCompleteJson = false;

      try {
        const parsed = extractJsonFromText(status.text || '');
        if (parsed?.answers && typeof parsed.answers === 'object') {
          const keysCount = Object.keys(parsed.answers).length;
          if (keysCount >= state.questions.length && keysCount > 0) hasCompleteJson = true;
        }
      } catch {
        /* incomplete JSON */
      }

      console.log(`[4/5] Poll: stopBtn=${status.stopButtonActive}, len=${textLength}, complete=${hasCompleteJson}, stable=${stableChecks}`);

      if (status.stopButtonActive || textLength < 100) {
        stableChecks = 0;
      } else if (textLength > prevTextLength) {
        stableChecks = 0;
      } else if (textLength === prevTextLength && textLength > 100) {
        stableChecks++;
        const required = hasCompleteJson ? 3 : 5;
        if (stableChecks >= required) {
          console.log('[4/5] AI response stable and complete. Proceeding...');
          aiDone = true;
          break;
        }
      }

      prevTextLength = textLength;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!aiDone) {
      console.error('[Promty] AI generation timed out after 5 minutes');
      await storage.set('quizState', null);
      return;
    }

    await new Promise((r) => setTimeout(r, 1500)); // let final render settle

    // ── Extract final response text ───────────────────────────────────────────
    const responseText = await execInTab(aiTabId, () => {
      const host = window.location.hostname;
      let text = '';

      if (host.includes('chatgpt.com')) {
        const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (msgs.length) text = msgs[msgs.length - 1].textContent || '';
        if (!text) {
          const prose = document.querySelectorAll('.markdown.prose');
          if (prose.length) text = prose[prose.length - 1].textContent || '';
        }
      } else if (host.includes('claude.ai')) {
        for (const sel of ['[data-is-streaming="false"]', '.font-claude-message', '.prose', '[class*="response"]', '.grid-cols-1 > div:last-child']) {
          const msgs = document.querySelectorAll(sel);
          if (msgs.length) {
            const c = msgs[msgs.length - 1].textContent || '';
            if (c.includes('"answers"') || c.length > text.length) text = c;
          }
        }
      } else if (host.includes('gemini.google.com')) {
        for (const sel of ['.model-response-text', '.response-container', '.message-content', 'message-content', '.markdown-main-panel', '[data-content-type="response"]']) {
          const msgs = document.querySelectorAll(sel);
          if (msgs.length) {
            const c = msgs[msgs.length - 1].textContent || '';
            if (c.includes('"answers"') || c.length > text.length) text = c;
          }
        }
      } else if (host.includes('deepseek.com')) {
        for (const sel of ['.ds-markdown--block', '.ds-markdown', '.ds-message-item .ds-markdown', '[class*="assistant"] [class*="markdown"]', '[class*="message"] [class*="markdown"]', 'pre', '[class*="content"]']) {
          try {
            const msgs = document.querySelectorAll(sel);
            if (msgs.length) {
              const c = msgs[msgs.length - 1].textContent || '';
              if (c.includes('"answers"') || c.length > text.length) text = c;
            }
          } catch {
            /* skip */
          }
        }
        const codeBlocks = document.querySelectorAll('pre code, pre');
        for (let i = codeBlocks.length - 1; i >= 0; i--) {
          const t = codeBlocks[i].textContent || '';
          if (t.includes('"answers"')) {
            text = t;
            break;
          }
        }
      }

      // Universal fallbacks
      if (!text || !text.includes('"answers"')) {
        const blocks = document.querySelectorAll('pre, code, .code-block');
        for (let i = blocks.length - 1; i >= 0; i--) {
          const t = blocks[i].textContent || '';
          if (t.includes('"answers"')) {
            text = t;
            break;
          }
        }
      }
      if (!text || !text.includes('"answers"')) {
        const all = document.querySelectorAll('div, section, article, p');
        for (let i = all.length - 1; i >= 0; i--) {
          const t = all[i].textContent || '';
          if (t.includes('"answers"') && (t.includes('option-id') || t.includes('_answer') || t.includes('question'))) {
            text = t;
            break;
          }
        }
      }

      return text;
    });

    if (!responseText) {
      console.error('[Promty] Could not extract AI response text');
      await storage.set('quizState', null);
      return;
    }

    console.log('[4/5] Response text length:', responseText.length);

    const parsed = extractJsonFromText(responseText);
    if (!parsed?.answers) {
      console.error('[Promty] Could not parse answers JSON');
      console.error('Raw (first 800 chars):', responseText.substring(0, 800));
      await storage.set('quizState', null);
      return;
    }

    console.log('[4/5] Parsed answers:', Object.keys(parsed.answers).length);
    console.log(
      '[4/5] Scraped question IDs:',
      state.questions.map((q) => q.id),
    );
    console.log('[4/5] AI answer keys:', Object.keys(parsed.answers));

    // ── Validate and map AI answers to scraped questions ─────────────────────
    const allValidOptionIds = new Set<string>();
    const questionIdToOptions = new Map<string, string[]>();
    for (const q of state.questions) {
      const ids = q.options.map((o) => o.id);
      questionIdToOptions.set(q.id, ids);
      ids.forEach((id) => allValidOptionIds.add(id));
    }

    const validatedAnswers: Record<string, string> = {};
    let mismatches = 0;
    const aiAnswerEntries = Object.entries(parsed.answers || {});
    const consumedAiKeys = new Set<string>();

    for (const q of state.questions) {
      let matchedOptId: string | undefined;
      let matchedAiKey: string | undefined;

      const matchQNum = q.text.match(/^\[Q(\d+)\]/i);
      const qNumberStr = matchQNum ? matchQNum[1] : undefined;

      // Match 1: exact key
      if (parsed.answers?.[q.id]) {
        matchedOptId = parsed.answers[q.id] as string;
        matchedAiKey = q.id;
      }

      // Match 2: case-insensitive
      if (!matchedOptId) {
        const qIdLower = q.id.toLowerCase().trim();
        for (const [k, v] of aiAnswerEntries) {
          if (consumedAiKeys.has(k)) continue;
          if (k.toLowerCase().trim() === qIdLower) {
            matchedOptId = v as string;
            matchedAiKey = k;
            break;
          }
        }
      }

      // Match 3: human question number (Q1, soal-1, etc.)
      if (!matchedOptId && qNumberStr) {
        for (const [k, v] of aiAnswerEntries) {
          if (consumedAiKeys.has(k)) continue;
          const norm = k.toLowerCase().replace(/\s+|-|_|\./g, '');
          const target = qNumberStr;
          if (norm === target || norm === `q${target}` || norm === `question${target}` || norm === `soal${target}` || norm === `no${target}` || norm === `nomor${target}`) {
            matchedOptId = v as string;
            matchedAiKey = k;
            console.log(`[Validate] Q-Number match: "${q.id}" (Q#${target}) ↔ AI key "${k}"`);
            break;
          }
        }
      }

      // Match 4: suffix match
      if (!matchedOptId) {
        const qParts = q.id.split('-');
        const qSuffix = qParts[qParts.length - 1];
        const qPrefix = qParts.slice(0, -1).join('-');
        for (const [k, v] of aiAnswerEntries) {
          if (consumedAiKeys.has(k)) continue;
          const aiParts = k.split('-');
          const aiSuffix = aiParts[aiParts.length - 1];
          const aiPrefix = aiParts.slice(0, -1).join('-');
          if (qSuffix === aiSuffix && (aiPrefix.includes(qPrefix.replace('question', '')) || qPrefix.includes(aiPrefix.replace('question', '')))) {
            matchedOptId = v as string;
            matchedAiKey = k;
            console.warn(`[Validate] Suffix match: "${q.id}" ↔ "${k}"`);
            break;
          }
        }
      }

      // Match 5: positional fallback
      if (!matchedOptId) {
        const qIndex = state.questions.indexOf(q);
        if (qIndex >= 0 && qIndex < aiAnswerEntries.length) {
          matchedOptId = aiAnswerEntries[qIndex][1] as string;
          matchedAiKey = aiAnswerEntries[qIndex][0];
          console.warn(`[Validate] Positional match: Q#${qIndex + 1} → AI entry #${qIndex + 1} "${matchedAiKey}"`);
        }
      }

      if (matchedAiKey) consumedAiKeys.add(matchedAiKey);

      const qOptions = questionIdToOptions.get(q.id) || [];

      // ── Redundant recovery layer ──────────────────────────────────────────
      if (!matchedOptId || !allValidOptionIds.has(matchedOptId)) {
        console.log(`[Validate] ID match failed for "${q.id}". Running redundant resolution...`);

        const explicitText = parsed.answer_texts?.[q.id] || parsed.detailed_analysis?.[q.id]?.selected_option_text || (matchedAiKey && parsed.detailed_analysis?.[matchedAiKey]?.selected_option_text);

        const explicitLetter = parsed.answer_letters?.[q.id] || parsed.detailed_analysis?.[q.id]?.selected_letter || (matchedAiKey && parsed.detailed_analysis?.[matchedAiKey]?.selected_letter) || matchedOptId;

        let resolved = false;

        // Strategy A: option text match
        if (!resolved && explicitText && typeof explicitText === 'string') {
          const norm = (s: string) =>
            s
              .toLowerCase()
              .replace(/[\u200B-\u200D\uFEFF]/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/^[a-f0-9][\s.\)-]\s*/, '')
              .trim();
          const textMatch = q.options.find((o) => {
            const on = norm(o.text);
            const en = norm(explicitText);
            return on === en || on.includes(en) || en.includes(on);
          });
          if (textMatch) {
            matchedOptId = textMatch.id;
            console.log(`[Validate] Text match: "${explicitText}" ↔ "${textMatch.text}"`);
            resolved = true;
          }
        }

        // Strategy B: letter remap (A→0, B→1, …)
        if (!resolved && explicitLetter && typeof explicitLetter === 'string') {
          const clean = explicitLetter
            .toLowerCase()
            .replace(/option|soal|pilihan/gi, '')
            .replace(/[^a-f]/gi, '')
            .trim()
            .toUpperCase();
          const idx = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 }[clean];
          if (idx !== undefined && idx < qOptions.length) {
            matchedOptId = qOptions[idx];
            console.log(`[Validate] Letter remap "${explicitLetter}" → idx ${idx} "${qOptions[idx]}"`);
            resolved = true;
          }
        }

        // Strategy C: matched value is the answer text itself
        if (!resolved && matchedOptId && qOptions.length) {
          const norm = (s: string) =>
            s
              .toLowerCase()
              .replace(/[\u200B-\u200D\uFEFF]/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/^[a-f0-9][\s.\)-]\s*/, '')
              .trim();
          const textMatch = q.options.find((o) => {
            const on = norm(o.text);
            const vn = norm(matchedOptId!);
            return on === vn || on.includes(vn) || vn.includes(on);
          });
          if (textMatch) {
            matchedOptId = textMatch.id;
            console.log(`[Validate] Value-as-text match: "${matchedOptId}"`);
            resolved = true;
          }
        }

        // Strategy D: numeric index
        if (!resolved && matchedOptId && qOptions.length) {
          const digits = matchedOptId.replace(/[^0-9]/g, '');
          if (digits) {
            const numIdx = parseInt(digits, 10);
            if (numIdx >= 0 && numIdx < qOptions.length) {
              matchedOptId = qOptions[numIdx];
              console.log(`[Validate] Digit idx ${numIdx} → "${qOptions[numIdx]}"`);
              resolved = true;
            }
          }
        }

        // Strategy E: suffix/partial ID match
        if (!resolved && matchedOptId && qOptions.length) {
          const partial = qOptions.find((id) => id.includes(matchedOptId!) || matchedOptId!.includes(id.split('_').pop() || '__'));
          if (partial) {
            matchedOptId = partial;
            console.log(`[Validate] Partial suffix match → "${partial}"`);
          }
        }
      }

      // Final assignment
      if (matchedOptId && allValidOptionIds.has(matchedOptId)) {
        validatedAnswers[q.id] = matchedOptId;
        const optText = q.options.find((o) => o.id === matchedOptId)?.text?.substring(0, 50) || '???';
        console.log(`[Validate] ✅ "${q.id}" → "${matchedOptId}" (${optText})`);
      } else {
        if (q.options.length > 0) {
          validatedAnswers[q.id] = q.options[0].id;
          console.error(`[Validate] ❌ No match for "${q.id}". Fallback → "${q.options[0].id}"`);
          mismatches++;
        }
      }
    }

    console.log(`[4/5] Validated: ${Object.keys(validatedAnswers).length}/${state.questions.length} questions, ${mismatches} fallbacks`);
    state.answers = validatedAnswers;
    state.status = 'filling';
    await storage.set('quizState', state);

    // ── STEP 5: Return to LMS and fill answers ────────────────────────────────
    console.log('[5/5] Closing AI tab, returning to LMS...');
    try {
      await chrome.tabs.remove(aiTabId);
    } catch {
      /* already closed */
    }

    try {
      await chrome.tabs.get(lmsTabId);
      await chrome.tabs.update(lmsTabId, { active: true });
    } catch {
      console.log('[5/5] LMS tab lost, recreating...');
      const newTab = await chrome.tabs.create({ url: lmsUrl, active: true });
      lmsTabId = newTab.id!;
      await awaitTabLoad(lmsTabId);
    }

    console.log('[5/5] Navigating back to page 1...');
    await new Promise((r) => setTimeout(r, 500));

    await safeSendMessage(lmsTabId, { type: 'JUMP_TO_PAGE_1' });
    await new Promise((r) => setTimeout(r, 500));
    await awaitTabLoad(lmsTabId);
    await new Promise((r) => setTimeout(r, 500));

    let hasPrev = true;
    while (hasPrev) {
      const pageCheck = (await safeSendMessage(lmsTabId, { type: 'SCRAPE_LMS' })) || { hasPrevious: false };
      hasPrev = !!pageCheck.hasPrevious;
      if (hasPrev) {
        console.log('[5/5] Clicking Previous Page...');
        await safeSendMessage(lmsTabId, { type: 'CLICK_PREVIOUS_LMS' });
        await new Promise((r) => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log('[5/5] At page 1. Filling answers...');
    let hasMorePages = true;
    while (hasMorePages) {
      const cur = await storage.get('quizState');
      if (!cur || cur.status === 'idle') return;

      await safeSendMessage(lmsTabId, {
        type: 'FILL_ANSWERS',
        payload: { answers: state.answers || {}, questions: state.questions || [] },
      });
      await new Promise((r) => setTimeout(r, 300));

      const checkRes = (await safeSendMessage(lmsTabId, { type: 'SCRAPE_LMS' })) || { hasNext: false };
      hasMorePages = checkRes.hasNext;
      if (hasMorePages) {
        await safeSendMessage(lmsTabId, { type: 'CLICK_NEXT_LMS' });
        await new Promise((r) => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    state.status = 'done';
    await storage.set('quizState', state);
    console.log('[Promty] ✅ Quiz solver completed successfully!');
  } catch (error) {
    console.error('[Promty] Quiz solver failed:', error);
    await storage.set('quizState', null);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_QUIZ') {
    startQuizSolver(message.payload.provider);
    sendResponse({ success: true });
    return true; // keep channel open for async response
  }

  if (message.type === 'STOP_QUIZ') {
    storage.set('quizState', null);
    sendResponse({ success: true });
    return true;
  }
});
