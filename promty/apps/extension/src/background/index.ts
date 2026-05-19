import { storage } from '../lib/storage';
import { QuizState, QuizQuestion } from '@promty/shared-types';

console.log('Promty Background Quiz Worker active.');

// ─── HELPERS ───

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
    const listener = (tid: number, changeInfo: any) => {
      if (tid === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 10000);
  });
}

// Execute a function directly inside a tab using chrome.scripting.executeScript
// This is MUCH more reliable than sendMessage for one-shot operations
async function execInTab(tabId: number, func: () => any): Promise<any> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
    });
    return results?.[0]?.result ?? null;
  } catch (e) {
    console.warn('[ExecInTab] Failed:', e);
    return null;
  }
}

// Extract balanced JSON object from text (handles nested braces, code fences, trailing commas, and comments)
function extractJsonFromText(text: string): any | null {
  if (!text) return null;

  // ── Step 1: Broad balanced-brace candidate extractor ──
  // We scan the text to find all valid balanced curly-brace blocks
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
      if (endIdx !== -1) {
        candidates.push(text.substring(i, endIdx + 1));
      }
    }
  }

  // ── Step 2: Search candidates from last/longest to first to find a valid JSON answers block ──
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (candidate.includes('"answers"')) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        // Try cleaning trailing commas or comments
        try {
          const cleaned = candidate
            .replace(/,\s*([\]}])/g, '$1') // remove trailing commas
            .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1'); // remove JS/JSON comments
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (e2) {
          // keep searching
        }
      }
    }
  }

  // ── Step 3: Fallback scan from the first opening brace to the last closing brace ──
  const firstOpen = text.indexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    const candidate = text.substring(firstOpen, lastClose + 1);
    if (candidate.includes('"answers"')) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        try {
          const cleaned = candidate
            .replace(/,\s*([\]}])/g, '$1')
            .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (e2) {}
      }
    }
  }

  return null;
}


// ─── ORCHESTRATOR ───

async function startQuizSolver(provider: string) {
  let lmsTabId = 0;
  let lmsUrl = '';

  try {
    // ── STEP 1: Validate LMS Tab ──
    // Query active tab using lastFocusedWindow to be resilient against popup/devtools focus clashing
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let lmsTab = tabs[0];
    if (!lmsTab) {
      // Fallback: check any active tab in any window
      const allActive = await chrome.tabs.query({ active: true });
      lmsTab = allActive[0];
    }
    if (!lmsTab?.id) { console.error('No active tab found'); return; }

    lmsTabId = lmsTab.id;
    lmsUrl = lmsTab.url || '';

    // Allow any Moodle LMS Quiz page (standard Moodle quiz paths are /mod/quiz/)
    const isMoodleQuiz = lmsUrl.includes('/mod/quiz/');
    if (!isMoodleQuiz) {
      chrome.notifications.create({ 
        type: 'basic', 
        iconUrl: 'icons/icon128.png', 
        title: 'Promty AI', 
        message: 'Buka halaman kuis LMS Telkom University / Moodle dulu!' 
      });
      await storage.set('quizState', null);
      return;
    }

    let state: QuizState = { status: 'extracting', aiProvider: provider as any, questions: [], answers: {}, currentLmsTabId: lmsTabId };
    await storage.set('quizState', state);
    console.log('[1/5] Scraping LMS quiz pages...');

    // ── STEP 2: Scrape All Pages ──
    let hasNext = true;
    while (hasNext) {
      const cur = await storage.get('quizState');
      if (!cur || cur.status === 'idle') return;

      const res = await safeSendMessage(lmsTabId, { type: 'SCRAPE_LMS' }) || { questions: [], hasNext: false, hasFinish: false, hasStartBtn: false };

      if (res.questions.length === 0 && res.hasStartBtn) {
        await safeSendMessage(lmsTabId, { type: 'CLICK_START_QUIZ' });
        await new Promise(r => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        const t = await chrome.tabs.get(lmsTabId); lmsUrl = t.url || lmsUrl;
        continue;
      }

      const newQs = res.questions.filter((nq: QuizQuestion) => !state.questions.some(q => q.id === nq.id));
      state.questions = [...state.questions, ...newQs];
      await storage.set('quizState', state);

      hasNext = res.hasNext;
      if (hasNext) {
        await safeSendMessage(lmsTabId, { type: 'CLICK_NEXT_LMS' });
        await new Promise(r => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        const t = await chrome.tabs.get(lmsTabId); lmsUrl = t.url || lmsUrl;
      }
    }

    console.log(`[2/5] Scraped ${state.questions.length} questions.`);
    if (state.questions.length === 0) { await storage.set('quizState', null); return; }

    // ── STEP 3: Send to AI ──
    state.status = 'waiting_ai';
    await storage.set('quizState', state);

    // ── Build maximum-accuracy prompt with chain-of-thought ──
    // Include FULL question text + FULL option text for every question
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

    console.log(`[3/5] Opening AI: ${aiUrl}`);
    const aiTab = await chrome.tabs.create({ url: aiUrl });
    if (!aiTab?.id) throw new Error('Failed to open AI tab');
    const aiTabId = aiTab.id;
    state.currentAiTabId = aiTabId;
    await storage.set('quizState', state);

    await awaitTabLoad(aiTabId);
    await new Promise(r => setTimeout(r, 2000)); // Let AI SPA fully hydrate

    // Inject prompt using executeScript — platform-aware injection
    console.log('[3/5] Injecting prompt into AI...');
    const promptToSend = systemPrompt;
    await chrome.scripting.executeScript({
      target: { tabId: aiTabId },
      func: (prompt: string) => {
        const host = window.location.hostname;

        // ─── Platform-specific editor finder ───
        let el: HTMLElement | null = null;

        if (host.includes('chatgpt.com')) {
          // ChatGPT uses a contenteditable div with id="prompt-textarea" (Lexical editor)
          el = document.querySelector('#prompt-textarea') as HTMLElement;
        } else if (host.includes('claude.ai')) {
          // Claude uses ProseMirror contenteditable div
          el = document.querySelector('div.ProseMirror[contenteditable="true"]') as HTMLElement;
          if (!el) el = document.querySelector('[contenteditable="true"]') as HTMLElement;
        } else if (host.includes('gemini.google.com')) {
          // Gemini uses rich-textarea with a nested contenteditable or a plain contenteditable
          const richTextarea = document.querySelector('rich-textarea');
          if (richTextarea) {
            el = richTextarea.querySelector('[contenteditable="true"]') as HTMLElement;
          }
          if (!el) el = document.querySelector('.ql-editor[contenteditable="true"]') as HTMLElement;
          if (!el) el = document.querySelector('[contenteditable="true"]') as HTMLElement;
        } else if (host.includes('deepseek.com')) {
          // DeepSeek uses a textarea inside the chat container
          el = document.querySelector('textarea#chat-input') as HTMLElement;
          if (!el) el = document.querySelector('textarea[placeholder]') as HTMLElement;
          if (!el) el = document.querySelector('textarea') as HTMLElement;
          if (!el) el = document.querySelector('[contenteditable="true"]') as HTMLElement;
        } else {
          el = document.querySelector('textarea') as HTMLElement ||
               document.querySelector('[contenteditable="true"]') as HTMLElement;
        }

        if (!el) { console.error('No editor found'); return false; }

        el.focus();

        // ─── Insert text using the most compatible method ───
        // Method 1: execCommand insertText (best for contenteditable / Lexical / ProseMirror)
        let inserted = false;
        if (el.getAttribute('contenteditable') === 'true' || el.isContentEditable) {
          try {
            // Clear existing content first
            document.execCommand('selectAll', false, undefined);
            inserted = document.execCommand('insertText', false, prompt);
          } catch (e) { /* fallback below */ }

          if (!inserted) {
            // Fallback: set innerHTML as paragraphs and fire input
            el.innerHTML = `<p>${prompt}</p>`;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            inserted = true;
          }
        }

        // Method 2: Native value setter for textarea/input elements
        if (!inserted && ('value' in el)) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(el, prompt);
          } else {
            (el as any).value = prompt;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          inserted = true;
        }

        // Method 3: Last resort innerText
        if (!inserted) {
          el.innerText = prompt;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
      },
      args: [promptToSend],
    });

    // Wait for framework state to settle, then click send with retries
    console.log('[3/5] Clicking send button...');
    for (let sendAttempt = 0; sendAttempt < 10; sendAttempt++) {
      await new Promise(r => setTimeout(r, 500));

      const clicked = await chrome.scripting.executeScript({
        target: { tabId: aiTabId },
        func: () => {
          const host = window.location.hostname;

          // Platform-specific send button selectors (ordered by priority)
          let selectors: string[] = [];

          if (host.includes('chatgpt.com')) {
            selectors = [
              'button[data-testid="send-button"]',
              'button[data-testid="fruitjuice-send-button"]',
            ];
          } else if (host.includes('claude.ai')) {
            selectors = [
              'button[aria-label="Send Message"]',
              'button[aria-label="Send message"]',
              'button[aria-label="Send Prompt"]',
              'fieldset button:not([aria-label="Attach files"])',
            ];
          } else if (host.includes('gemini.google.com')) {
            selectors = [
              'button[aria-label="Send message"]',
              'button[aria-label="Send Message"]',
              'button.send-button',
              '.input-area-container button.send',
            ];
          } else if (host.includes('deepseek.com')) {
            // DeepSeek: the send button is often an SVG button at the bottom of the chat input
            selectors = [
              'button[aria-label="Send"]',
              'button[aria-label="Send message"]',
              // DeepSeek chat uses a button with an SVG inside the input area
              '#ds-chat-input-btn',
              'div.ds-chat-input-footer button:not([disabled])',
              'textarea ~ button',
            ];
          }

          // Add universal fallbacks
          selectors.push(
            'button[type="submit"]',
            'form button:last-of-type',
          );

          for (const sel of selectors) {
            try {
              const btn = document.querySelector(sel) as HTMLElement;
              if (btn && !btn.hasAttribute('disabled') && !btn.classList.contains('disabled')) {
                btn.click();
                return true;
              }
            } catch (e) { /* selector might be invalid */ }
          }

          // SVG icon fallback: find button containing an SVG send arrow icon
          const allBtns = document.querySelectorAll('button');
          for (const btn of Array.from(allBtns)) {
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
        console.log('[3/5] Send button clicked successfully!');
        break;
      }

      // On last attempt, try Enter key as absolute last resort
      if (sendAttempt === 9) {
        console.log('[3/5] Using Enter key fallback...');
        await chrome.scripting.executeScript({
          target: { tabId: aiTabId },
          func: () => {
            const el = document.querySelector('#prompt-textarea') ||
                       document.querySelector('[contenteditable="true"]') ||
                       document.querySelector('textarea');
            if (el) {
              el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
          },
        });
      }
    }

    // ── STEP 4: Poll AI for completion (from background, using executeScript) ──
    console.log('[4/5] Waiting for AI to finish generating...');

    let prevTextLength = 0;
    let stableChecks = 0;
    let aiDone = false;

    // Poll every 2 seconds for up to 5 minutes (chain-of-thought + web search takes longer)
    for (let attempt = 0; attempt < 150; attempt++) {
      const status = await execInTab(aiTabId, () => {
        const host = window.location.hostname;

        // 1. Check if a stop button / generating indicator is actively visible
        let stopButtonActive = false;
        if (host.includes('chatgpt.com')) {
          stopButtonActive = !!document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]');
        } else if (host.includes('claude.ai')) {
          stopButtonActive = !!document.querySelector('button[aria-label="Stop Response"], button[aria-label="Stop generating"], [data-is-streaming="true"]');
        } else if (host.includes('gemini.google.com')) {
          stopButtonActive = !!document.querySelector('button[aria-label="Stop generation"], button[aria-label="Stop"], button[aria-label="Cancel"]');
        } else if (host.includes('deepseek.com')) {
          // Check for explicit stop button or stop icon inside buttons
          const stopBtn = document.querySelector('button .ds-icon-stop, button[aria-label="Stop"], button[title="Stop"]');
          if (stopBtn) stopButtonActive = true;

          // Check for active loading/streaming spinners
          const loading = document.querySelector('.ds-loading, .ds-loading-spinner, .ds-loading-bar');
          if (loading) stopButtonActive = true;
        }

        // 2. Extract current text of the last response
        let text = '';
        if (host.includes('chatgpt.com')) {
          const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
          if (msgs.length > 0) text = msgs[msgs.length - 1].textContent || '';
          if (!text) {
            const prose = document.querySelectorAll('.markdown.prose');
            if (prose.length > 0) text = prose[prose.length - 1].textContent || '';
          }
        } else if (host.includes('claude.ai')) {
          const selectors = ['[data-is-streaming]', '.font-claude-message', '.prose', '[class*="response"]'];
          for (const sel of selectors) {
            const msgs = document.querySelectorAll(sel);
            if (msgs.length > 0) {
              const candidate = msgs[msgs.length - 1].textContent || '';
              if (candidate.length > text.length) text = candidate;
            }
          }
        } else if (host.includes('gemini.google.com')) {
          const selectors = ['.model-response-text', '.response-container', '.message-content', 'message-content', '.markdown-main-panel', '[data-content-type="response"]'];
          for (const sel of selectors) {
            const msgs = document.querySelectorAll(sel);
            if (msgs.length > 0) {
              const candidate = msgs[msgs.length - 1].textContent || '';
              if (candidate.length > text.length) text = candidate;
            }
          }
        } else if (host.includes('deepseek.com')) {
          const selectors = ['.ds-markdown--block', '.ds-markdown', '.ds-message-item .ds-markdown', '[class*="assistant"] [class*="markdown"]', '[class*="message"] [class*="markdown"]', 'pre', '[class*="content"]'];
          for (const sel of selectors) {
            const msgs = document.querySelectorAll(sel);
            if (msgs.length > 0) {
              const candidate = msgs[msgs.length - 1].textContent || '';
              if (candidate.length > text.length) text = candidate;
            }
          }
          const codeBlocks = document.querySelectorAll('pre code, pre');
          for (let i = codeBlocks.length - 1; i >= 0; i--) {
            const t = codeBlocks[i].textContent || '';
            if (t.includes('"answers"')) { text = t; break; }
          }
        }

        // Universal fallback: scan ALL code blocks or large divs
        if (!text || !text.includes('"answers"')) {
          const blocks = document.querySelectorAll('pre, code, .code-block');
          for (let i = blocks.length - 1; i >= 0; i--) {
            const t = blocks[i].textContent || '';
            if (t.includes('"answers"')) { text = t; break; }
          }
        }
        if (!text) {
          const allDivs = document.querySelectorAll('div, section, article, p');
          for (let i = allDivs.length - 1; i >= 0; i--) {
            const t = allDivs[i].textContent || '';
            if (t.length > text.length) text = t;
          }
        }

        return {
          stopButtonActive,
          text
        };
      }) || { stopButtonActive: false, text: '' };

      const text = status.text || '';
      const textLength = text.length;

      // Robust check: try to parse a completed answers JSON structure
      let hasCompleteJson = false;
      try {
        const parsed = extractJsonFromText(text);
        if (parsed && parsed.answers && typeof parsed.answers === 'object') {
          const keysCount = Object.keys(parsed.answers).length;
          // Valid only if we successfully parsed answers for all scraped questions
          if (keysCount >= state.questions.length && keysCount > 0) {
            hasCompleteJson = true;
          }
        }
      } catch (e) {
        // incomplete JSON
      }

      console.log(`[4/5] Polling AI: stopBtn=${status.stopButtonActive}, textLength=${textLength}, hasCompleteJson=${hasCompleteJson}, prevLen=${prevTextLength}, stableChecks=${stableChecks}`);

      // ── Core State Machine Checks ──

      // If stop button is visible, it is actively generating
      if (status.stopButtonActive) {
        stableChecks = 0;
      }
      // If the text is still empty or too short, it is still loading or thinking
      else if (textLength < 100) {
        stableChecks = 0;
      }
      // If the text is growing, it is actively streaming
      else if (textLength > prevTextLength) {
        stableChecks = 0;
      }
      // If the text is non-empty, stable, and stop button is gone
      else if (textLength === prevTextLength && textLength > 100) {
        stableChecks++;

        // Safety: We require the text to be completely stable to avoid network/rendering stream delays:
        // - If we have a fully complete and valid JSON containing ALL answers, we require at least 3 stable checks (6 seconds of absolute stability).
        // - Otherwise, we require the text to be perfectly stable for at least 5 stable checks (10 seconds of absolute stability).
        const requiredStable = hasCompleteJson ? 3 : 5;
        if (stableChecks >= requiredStable) {
          console.log(`[4/5] AI response fully complete and stable! proceeding...`);
          aiDone = true;
          break;
        }
      }

      prevTextLength = textLength;
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!aiDone) {
      console.error('AI generation timed out after 5 minutes');
      await storage.set('quizState', null);
      return;
    }

    console.log('[4/5] AI generation complete. Extracting response text...');
    await new Promise(r => setTimeout(r, 1500)); // Let final render settle

    // Extract the response text — platform-specific selectors
    const responseText = await execInTab(aiTabId, () => {
      const host = window.location.hostname;
      let text = '';

      if (host.includes('chatgpt.com')) {
        // ChatGPT: assistant messages have data-message-author-role="assistant"
        const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (msgs.length > 0) text = msgs[msgs.length - 1].textContent || '';
        if (!text) {
          const prose = document.querySelectorAll('.markdown.prose');
          if (prose.length > 0) text = prose[prose.length - 1].textContent || '';
        }
      } else if (host.includes('claude.ai')) {
        // Claude: assistant responses are in various containers
        const selectors = [
          '[data-is-streaming="false"]',      // completed response
          '.font-claude-message',              // Claude message container
          '.prose',                            // prose container
          '[class*="response"]',               // any response class
          '.grid-cols-1 > div:last-child',     // conversation grid
        ];
        for (const sel of selectors) {
          const msgs = document.querySelectorAll(sel);
          if (msgs.length > 0) {
            const candidate = msgs[msgs.length - 1].textContent || '';
            if (candidate.includes('"answers"') || candidate.length > text.length) {
              text = candidate;
            }
          }
        }
      } else if (host.includes('gemini.google.com')) {
        // Gemini: model responses in various containers
        const selectors = [
          '.model-response-text',
          '.response-container',
          '.message-content',
          'message-content',                   // web component
          '.markdown-main-panel',
          '[data-content-type="response"]',
        ];
        for (const sel of selectors) {
          const msgs = document.querySelectorAll(sel);
          if (msgs.length > 0) {
            const candidate = msgs[msgs.length - 1].textContent || '';
            if (candidate.includes('"answers"') || candidate.length > text.length) {
              text = candidate;
            }
          }
        }
      } else if (host.includes('deepseek.com')) {
        // DeepSeek: assistant messages rendered in markdown blocks
        // Try selectors from most to least specific
        const dsSelectors = [
          '.ds-markdown--block',                  // primary markdown container
          '.ds-markdown',                          // parent markdown wrapper
          '.ds-message-item .ds-markdown',         // message item with markdown
          '[class*="assistant"] [class*="markdown"]',
          '[class*="message"] [class*="markdown"]',
          'pre',                                   // code blocks (where JSON is often put)
          '[class*="content"]',                    // any content container
        ];
        for (const sel of dsSelectors) {
          try {
            const msgs = document.querySelectorAll(sel);
            if (msgs.length > 0) {
              const candidate = msgs[msgs.length - 1].textContent || '';
              if (candidate.includes('"answers"') || candidate.length > text.length) {
                text = candidate;
              }
            }
          } catch (e) {}
        }
        // Also scan for code blocks containing JSON specifically
        const codeBlocks = document.querySelectorAll('pre code, pre');
        for (let i = codeBlocks.length - 1; i >= 0; i--) {
          const t = codeBlocks[i].textContent || '';
          if (t.includes('"answers"')) { text = t; break; }
        }
      }

      // Universal fallback: search ALL code blocks and large divs for the answers JSON
      if (!text || !text.includes('"answers"')) {
        const blocks = document.querySelectorAll('pre, code, .code-block');
        for (let i = blocks.length - 1; i >= 0; i--) {
          const t = blocks[i].textContent || '';
          if (t.includes('"answers"')) { text = t; break; }
        }
      }

      // Final fallback: scan ALL elements on the page for the answers pattern
      if (!text || !text.includes('"answers"')) {
        const allDivs = document.querySelectorAll('div, section, article, p');
        for (let i = allDivs.length - 1; i >= 0; i--) {
          const t = allDivs[i].textContent || '';
          // Match any JSON that has an "answers" key (broad pattern)
          if (t.includes('"answers"') && (t.includes('option-id') || t.includes('_answer') || t.includes('question'))) {
            text = t;
            break;
          }
        }
      }

      return text;
    });

    if (!responseText) {
      console.error('Could not extract AI response text');
      await storage.set('quizState', null);
      return;
    }

    console.log('[4/5] Extracted response text length:', responseText.length);

    // Parse answers using balanced brace JSON extractor (handles code fences)
    const parsed = extractJsonFromText(responseText);
    if (!parsed?.answers) {
      console.error('Could not parse answers JSON from AI response');
      console.error('Raw text (first 800 chars):', responseText.substring(0, 800));
      await storage.set('quizState', null);
      return;
    }

    console.log('[4/5] Parsed answers:', Object.keys(parsed.answers).length, 'raw answers');

    // Debug: log scraped question IDs vs AI answer keys so we can see the mapping
    console.log('[4/5] Scraped question IDs:', state.questions.map(q => q.id));
    console.log('[4/5] AI answer keys:', Object.keys(parsed.answers));

    // ── Validate: map AI answers to scraped questions precisely ──
    const allValidOptionIds = new Set<string>();
    const questionIdToOptions = new Map<string, string[]>();
    for (const q of state.questions) {
      const ids = q.options.map(o => o.id);
      questionIdToOptions.set(q.id, ids);
      ids.forEach(id => allValidOptionIds.add(id));
    }

    const validatedAnswers: Record<string, string> = {};
    let mismatches = 0;

    // Build AI answers map with multiple key variants for matching
    const aiAnswerEntries = Object.entries(parsed.answers || {});
    const consumedAiKeys = new Set<string>(); // Track which AI answer keys have been used

    for (const q of state.questions) {
      let matchedOptId: string | undefined;
      let matchedAiKey: string | undefined;

      // Extract human-readable question number from text prefix like "[Q1]"
      const matchQNum = q.text.match(/^\[Q(\d+)\]/i);
      const qNumberStr = matchQNum ? matchQNum[1] : undefined;

      // ── Match 1: Exact key match ──
      if (parsed.answers && parsed.answers[q.id]) {
        matchedOptId = parsed.answers[q.id] as string;
        matchedAiKey = q.id;
      }

      // ── Match 2: Case-insensitive / trimmed match ──
      if (!matchedOptId && parsed.answers) {
        const qIdLower = q.id.toLowerCase().trim();
        for (const [aiKey, aiVal] of aiAnswerEntries) {
          if (consumedAiKeys.has(aiKey)) continue;
          if (aiKey.toLowerCase().trim() === qIdLower) {
            matchedOptId = aiVal as string;
            matchedAiKey = aiKey;
            break;
          }
        }
      }

      // ── Match 3: Human Question Number Match (extremely robust for AI response keys!) ──
      // Checks keys like "1", "Q1", "q1", "question 1", "question-1", "soal 1", etc.
      if (!matchedOptId && qNumberStr && parsed.answers) {
        const targetNum = qNumberStr;
        for (const [aiKey, aiVal] of aiAnswerEntries) {
          if (consumedAiKeys.has(aiKey)) continue;

          // Normalize the AI key to strip spaces, hyphens, underscores, and dots
          const normAiKey = aiKey.toLowerCase().replace(/\s+|-|_|\./g, '');
          
          if (
            normAiKey === targetNum ||
            normAiKey === `q${targetNum}` ||
            normAiKey === `question${targetNum}` ||
            normAiKey === `soal${targetNum}` ||
            normAiKey === `no${targetNum}` ||
            normAiKey === `nomor${targetNum}`
          ) {
            matchedOptId = aiVal as string;
            matchedAiKey = aiKey;
            console.log(`[Validate] Human Q-Number matched: Scraped "${q.id}" (Q#${targetNum}) ↔ AI key "${aiKey}"`);
            break;
          }
        }
      }

      // ── Match 4: Suffix match — compare the LAST unique segment of the ID ──
      if (!matchedOptId && parsed.answers) {
        const qIdParts = q.id.split('-');
        const qSuffix = qIdParts[qIdParts.length - 1]; // e.g. "6"
        const qPrefix = qIdParts.slice(0, -1).join('-'); // e.g. "question-4871395"

        for (const [aiKey, aiVal] of aiAnswerEntries) {
          if (consumedAiKeys.has(aiKey)) continue;
          const aiParts = aiKey.split('-');
          const aiSuffix = aiParts[aiParts.length - 1];
          const aiPrefix = aiParts.slice(0, -1).join('-');

          if (qSuffix === aiSuffix && (aiPrefix.includes(qPrefix.replace('question', '')) || qPrefix.includes(aiPrefix.replace('question', '')))) {
            matchedOptId = aiVal as string;
            matchedAiKey = aiKey;
            console.warn(`[Validate] Suffix-matched: Scraped "${q.id}" ↔ AI key "${aiKey}"`);
            break;
          }
        }
      }

      // ── Match 5: Positional fallback — match by absolute order (nth question → nth answer) ──
      if (!matchedOptId && parsed.answers) {
        const qIndex = state.questions.indexOf(q);
        if (qIndex >= 0 && qIndex < aiAnswerEntries.length) {
          matchedOptId = aiAnswerEntries[qIndex][1] as string;
          matchedAiKey = aiAnswerEntries[qIndex][0];
          console.warn(`[Validate] Positional match: Question #${qIndex + 1} "${q.id}" → AI entry #${qIndex + 1} "${matchedAiKey}"`);
        }
      }

      // Mark the AI key as consumed so it's not reused
      if (matchedAiKey) consumedAiKeys.add(matchedAiKey);

      // ── REDUNDANT RECOVERY LAYER (Ultimate Multi-Layer Verification) ──
      // This is a powerful backup: if matchedOptId is missing, empty, or not valid,
      // we recover the choice using the redundant option texts and option letters!
      
      const qOptions = questionIdToOptions.get(q.id) || [];

      if (!matchedOptId || !allValidOptionIds.has(matchedOptId)) {
        console.log(`[Validate] ID based match failed or invalid for ${q.id}. Running redundant resolution...`);

        // Get option text from redundant properties
        const explicitText = 
          (parsed.answer_texts && parsed.answer_texts[q.id]) ||
          (parsed.detailed_analysis && parsed.detailed_analysis[q.id]?.selected_option_text) ||
          (matchedAiKey && parsed.detailed_analysis && parsed.detailed_analysis[matchedAiKey]?.selected_option_text);

        // Get option letter from redundant properties
        const explicitLetter = 
          (parsed.answer_letters && parsed.answer_letters[q.id]) ||
          (parsed.detailed_analysis && parsed.detailed_analysis[q.id]?.selected_letter) ||
          (matchedAiKey && parsed.detailed_analysis && parsed.detailed_analysis[matchedAiKey]?.selected_letter) ||
          matchedOptId; // if matchedOptId is just a letter like "A"

        let resolved = false;

        // Recovery Strategy A: REDUNDANT OPTION TEXT MATCH
        if (explicitText && typeof explicitText === 'string') {
          const cleanTextNorm = explicitText.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().replace(/^[a-f0-9][\s\.\)\-]\s*/, '').trim();
          const textMatch = q.options.find(opt => {
            const optTextNorm = opt.text.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().replace(/^[a-f0-9][\s\.\)\-]\s*/, '').trim();
            return optTextNorm === cleanTextNorm || optTextNorm.includes(cleanTextNorm) || cleanTextNorm.includes(optTextNorm);
          });

          if (textMatch) {
            matchedOptId = textMatch.id;
            console.log(`[Validate] Resolved by REDUNDANT OPTION TEXT match: "${explicitText}" ↔ "${textMatch.text}" for Q="${q.id}"`);
            resolved = true;
          }
        }

        // Recovery Strategy B: REDUNDANT LETTER REMAP (A -> index 0, B -> index 1)
        if (!resolved && explicitLetter && typeof explicitLetter === 'string') {
          const letterToIdx: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };
          const cleanLetter = explicitLetter.toLowerCase().replace(/option|soal|pilihan/gi, '').replace(/[^a-f]/gi, '').trim().toUpperCase();

          if (cleanLetter && cleanLetter.length === 1 && letterToIdx[cleanLetter] !== undefined) {
            const idx = letterToIdx[cleanLetter];
            if (idx >= 0 && idx < qOptions.length) {
              matchedOptId = qOptions[idx];
              console.log(`[Validate] Resolved by REDUNDANT LETTER match: "${explicitLetter}" → index ${idx} ("${qOptions[idx]}") for Q="${q.id}"`);
              resolved = true;
            }
          }
        }

        // Recovery Strategy C: Native text matching of the matched value (e.g. if matchedOptId is the actual answer text instead of ID)
        if (!resolved && matchedOptId && typeof matchedOptId === 'string' && qOptions.length > 0) {
          const cleanValNorm = matchedOptId.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().replace(/^[a-f0-9][\s\.\)\-]\s*/, '').trim();
          const textMatch = q.options.find(opt => {
            const optTextNorm = opt.text.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().replace(/^[a-f0-9][\s\.\)\-]\s*/, '').trim();
            return optTextNorm === cleanValNorm || optTextNorm.includes(cleanValNorm) || cleanValNorm.includes(optTextNorm);
          });

          if (textMatch) {
            matchedOptId = textMatch.id;
            console.log(`[Validate] Resolved by matched ID-value TEXT search: "${matchedOptId}" ↔ "${textMatch.text}"`);
            resolved = true;
          }
        }

        // Recovery Strategy D: Numeric index matching (e.g. if the option is just a number string "0", "1")
        if (!resolved && matchedOptId && typeof matchedOptId === 'string' && qOptions.length > 0) {
          const cleanDigits = matchedOptId.replace(/[^0-9]/g, '');
          if (cleanDigits) {
            const numIdx = parseInt(cleanDigits, 10);
            if (numIdx >= 0 && numIdx < qOptions.length) {
              matchedOptId = qOptions[numIdx];
              console.log(`[Validate] Resolved by digit index: "${matchedOptId}" → index ${numIdx} ("${qOptions[numIdx]}")`);
              resolved = true;
            }
          }
        }

        // Recovery Strategy E: Suffix/partial match fallback
        if (!resolved && matchedOptId && typeof matchedOptId === 'string' && qOptions.length > 0) {
          const partialMatch = qOptions.find(id =>
            id.includes(matchedOptId!) || matchedOptId!.includes(id.split('_').pop() || '__none__')
          );
          if (partialMatch) {
            matchedOptId = partialMatch;
            console.log(`[Validate] Resolved by partial ID suffix match: "${matchedOptId}" → "${partialMatch}"`);
            resolved = true;
          }
        }
      }

      // Final Check: Assign the matched or resolved ID, otherwise fallback to the first option
      if (matchedOptId && allValidOptionIds.has(matchedOptId)) {
        validatedAnswers[q.id] = matchedOptId;
        console.log(`[Validate] ✅ Final Match: Q="${q.id}" → Option="${matchedOptId}"`);
      } else {
        if (q.options.length > 0) {
          validatedAnswers[q.id] = q.options[0].id;
          console.error(`[Validate] ❌ No valid match found for Q="${q.id}". Falling back to first option: "${q.options[0].id}"`);
          mismatches++;
        }
      }
    }

    // Final debug: dump every validated answer
    for (const [qId, optId] of Object.entries(validatedAnswers)) {
      const q = state.questions.find(sq => sq.id === qId);
      const optText = q?.options.find(o => o.id === optId)?.text || '???';
      console.log(`[4/5] Final: "${qId}" → "${optId}" (${optText.substring(0, 50)})`);
    }

    console.log(`[4/5] Validated answers: ${Object.keys(validatedAnswers).length}/${state.questions.length} questions answered, ${mismatches} fallbacks`);
    state.answers = validatedAnswers;
    state.status = 'filling';
    await storage.set('quizState', state);

    // ── STEP 5: Go back to LMS and fill answers ──
    console.log('[5/5] Closing AI tab, returning to LMS...');
    try { await chrome.tabs.remove(aiTabId); } catch (e) { /* already closed */ }

    // Restore LMS tab
    try {
      await chrome.tabs.get(lmsTabId);
      await chrome.tabs.update(lmsTabId, { active: true });
    } catch (e) {
      console.log('LMS tab lost, recreating...');
      const newTab = await chrome.tabs.create({ url: lmsUrl, active: true });
      lmsTabId = newTab.id!;
      await awaitTabLoad(lmsTabId);
    }

    // Navigate backwards to page 1 by clicking "Previous page" repeatedly
    console.log('[5/5] Navigating back to page 1...');
    await new Promise(r => setTimeout(r, 500));

    // First try the quick jump link
    await safeSendMessage(lmsTabId, { type: 'JUMP_TO_PAGE_1' });
    await new Promise(r => setTimeout(r, 500));
    await awaitTabLoad(lmsTabId);
    await new Promise(r => setTimeout(r, 500));

    // Then keep clicking "Previous page" until there's no previous button left
    let hasPrev = true;
    while (hasPrev) {
      const pageCheck = await safeSendMessage(lmsTabId, { type: 'SCRAPE_LMS' }) || { hasPrevious: false };
      hasPrev = !!pageCheck.hasPrevious;
      if (hasPrev) {
        console.log('[5/5] Clicking Previous Page...');
        await safeSendMessage(lmsTabId, { type: 'CLICK_PREVIOUS_LMS' });
        await new Promise(r => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    console.log('[5/5] Arrived at page 1. Starting to fill answers...');

    // Fill page by page (forward)
    let hasMorePages = true;
    while (hasMorePages) {
      const cur = await storage.get('quizState');
      if (!cur || cur.status === 'idle') return;

      console.log('[5/5] Filling answers on current page...');
      await safeSendMessage(lmsTabId, { type: 'FILL_ANSWERS', payload: { answers: state.answers || {}, questions: state.questions || [] } });
      await new Promise(r => setTimeout(r, 300));

      const checkRes = await safeSendMessage(lmsTabId, { type: 'SCRAPE_LMS' }) || { hasNext: false };
      hasMorePages = checkRes.hasNext;

      if (hasMorePages) {
        await safeSendMessage(lmsTabId, { type: 'CLICK_NEXT_LMS' });
        await new Promise(r => setTimeout(r, 500));
        await awaitTabLoad(lmsTabId);
        await new Promise(r => setTimeout(r, 500));
      }
    }

    state.status = 'done';
    await storage.set('quizState', state);
    console.log('✅ Quiz solver completed successfully!');

  } catch (error) {
    console.error('Quiz solver failed:', error);
    await storage.set('quizState', null);
  }
}

// ─── LISTENERS ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_QUIZ') {
    startQuizSolver(message.payload.provider);
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'STOP_QUIZ') {
    storage.set('quizState', null);
    sendResponse({ success: true });
    return true;
  }
});
