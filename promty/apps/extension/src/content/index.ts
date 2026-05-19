import { QuizQuestion, QuizState } from '@promty/shared-types';

console.log('Promty LMS content script active.');

// Helper to get main document and all same-origin iframe documents (robust iframe support)
function getRootDocuments(): Document[] {
  const docs: Document[] = [document];
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      if (iframe.contentDocument) {
        docs.push(iframe.contentDocument);
      }
    } catch (e) {
      // Skip cross-origin iframes due to security policy
    }
  });
  return docs;
}

// Ghost Cursor Animation and Clicking Helper - Super Snappy Version
async function animateCursorAndClick(element: HTMLElement, durationMs: number = 250): Promise<void> {
  // Ensure the element is in view rapidly
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 150)); // Fast wait for scroll

  return new Promise((resolve) => {
    const cursor = document.createElement('div');
    cursor.id = 'promty-ghost-cursor';
    cursor.style.position = 'fixed';
    
    // Start cursor in the center of the screen
    cursor.style.top = '50vh';
    cursor.style.left = '50vw';
    cursor.style.width = '20px';
    cursor.style.height = '20px';
    cursor.style.backgroundColor = 'rgba(59, 130, 246, 0.8)'; // Blue glow
    cursor.style.borderRadius = '50%';
    cursor.style.border = '2px solid white';
    cursor.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.8)';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '999999999';
    cursor.style.transition = `all ${durationMs}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    
    document.body.appendChild(cursor);
    cursor.getBoundingClientRect(); // Force reflow
    
    const rect = element.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    
    // Animate cursor to target element
    cursor.style.left = `${targetX - 10}px`;
    cursor.style.top = `${targetY - 10}px`;
    
    setTimeout(() => {
      // Click visual feedback
      cursor.style.transform = 'scale(0.5)';
      cursor.style.backgroundColor = 'rgba(16, 185, 129, 0.9)'; // Green click
      cursor.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.9)';
      
      setTimeout(() => {
        element.focus();
        element.click();
        
        // Trigger standard browser events
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
        
        cursor.style.opacity = '0';
        setTimeout(() => {
          cursor.remove();
          resolve();
        }, 100);
      }, 50);
    }, durationMs);
  });
}

// Deep-clean whitespace and artifacts from scraped text
function cleanText(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // zero-width chars
    .replace(/\s+/g, ' ')                    // collapse all whitespace
    .trim()
    .replace(/^[a-zA-Z][\.\)]\s*/, '')       // strip leading option letters like "a. " or "a) "
    .trim();
}

// Scrape Moodle LMS questions - Deeply accurate version
function scrapeLmsQuestions(): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const docs = getRootDocuments();

  docs.forEach((doc) => {
    const questionContainers = doc.querySelectorAll('.que');

    questionContainers.forEach((container) => {
      const id = container.id;
      if (!id) return;

      // ── Question Number ──
      const infoEl = container.querySelector('.info .no');
      const questionNumber = infoEl ? cleanText(infoEl.textContent || '') : '';

      // ── Question Text — deep clone, strip img alt noise, get clean text ──
      const qtextEl = container.querySelector('.qtext');
      if (!qtextEl) return;

      // Walk all text nodes directly (skip images, avoid duplicating alt text)
      const getDeepText = (el: Element): string => {
        let result = '';
        el.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent || '';
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el2 = node as Element;
            if (el2.tagName === 'IMG') {
              result += el2.getAttribute('alt') ? `[image: ${el2.getAttribute('alt')}]` : '';
            } else {
              result += getDeepText(el2);
            }
          }
        });
        return result;
      };

      const questionText = cleanText(getDeepText(qtextEl));
      if (!questionText) return;

      const text = questionNumber ? `[Q${questionNumber}] ${questionText}` : questionText;

      // ── Options — find every radio/checkbox and its label ──
      const options: { id: string; text: string }[] = [];
      const answerBlock = container.querySelector('.answer');
      if (answerBlock) {
        const inputs = answerBlock.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        inputs.forEach((input) => {
          const inputEl = input as HTMLInputElement;
          // Canonical ID: prefer element id, fallback to name+value
          const inputId = inputEl.id || `${inputEl.name}_${inputEl.value}`;

          let optionText = '';

          // Strategy 1: explicit label[for=...] (scoped strictly to the question container)
          if (inputEl.id) {
            const lbl = container.querySelector(`label[for="${inputEl.id}"]`);
            if (lbl) optionText = cleanText(getDeepText(lbl as Element));
          }

          // Strategy 2: wrapping <label> ancestor
          if (!optionText) {
            const wrapLabel = inputEl.closest('label');
            if (wrapLabel) {
              // Clone label, remove the input from clone so text is clean
              const clone = wrapLabel.cloneNode(true) as HTMLElement;
              clone.querySelectorAll('input').forEach(i => i.remove());
              optionText = cleanText(getDeepText(clone));
            }
          }

          // Strategy 3: sibling label inside option wrapper (e.g. .r0, .r1, .option, or parent div)
          if (!optionText) {
            const optionWrapper = inputEl.closest('.r0, .r1, .option, .form-check, li, div');
            if (optionWrapper) {
              const lbl = optionWrapper.querySelector('label');
              if (lbl) optionText = cleanText(getDeepText(lbl));
            }
          }

          // Strategy 4: parent div full text (last resort)
          if (!optionText) {
            const parentDiv = inputEl.closest('div');
            if (parentDiv) {
              const clone = parentDiv.cloneNode(true) as HTMLElement;
              clone.querySelectorAll('input').forEach(i => i.remove());
              optionText = cleanText(getDeepText(clone));
            }
          }

          if (optionText && inputId) {
            options.push({ id: inputId, text: optionText });
          }
        });

        // ── Strategy 5: If no radio/checkbox options, check for short answer / essay / numeric (isian) text fields ──
        if (options.length === 0) {
          const textInputs = answerBlock.querySelectorAll('input[type="text"], input[type="number"], textarea');
          textInputs.forEach((ti) => {
            const tiEl = ti as HTMLInputElement | HTMLTextAreaElement;
            const inputId = tiEl.id || tiEl.name || '';
            if (inputId) {
              options.push({ id: inputId, text: '[isian]' });
            }
          });
        }
      }

      if (text && options.length > 0) {
        questions.push({ id, text, options });
      }
    });
  });

  return questions;
}

// Ultimate robust input finder that handles colons, partial matches, and custom name/values in Moodle
function findInputElement(doc: Document, optionId: string): HTMLInputElement | null {
  // 1. Try standard getElementById
  let el = doc.getElementById(optionId) as HTMLInputElement;
  if (el) return el;

  // 2. Try attribute selector for ID (escapes colon issues in querySelector)
  try {
    el = doc.querySelector(`input[id="${optionId}"]`) as HTMLInputElement;
    if (el) return el;
  } catch (e) {}

  // 3. Scan all inputs for exact ID, computed name_value, or partial matches
  const inputs = doc.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  for (const input of Array.from(inputs)) {
    const inputEl = input as HTMLInputElement;
    const inputId = inputEl.id || '';
    const computedId = inputEl.name + '_' + inputEl.value;

    // Exact match on id or computed id
    if (inputId === optionId || computedId === optionId) {
      return inputEl;
    }
  }

  // 4. Fuzzy match: extract the core pattern (e.g., "answer0" from "q123:4_answer0")
  const answerMatch = optionId.match(/answer(\d+)/);
  const questionMatch = optionId.match(/(\d+):(\d+)/);
  if (answerMatch && questionMatch) {
    const qNum = questionMatch[2];
    const aNum = answerMatch[1];

    for (const input of Array.from(inputs)) {
      const inputEl = input as HTMLInputElement;
      const id = inputEl.id || '';
      if (id.includes(`:${qNum}_`) && id.includes(`answer${aNum}`)) {
        return inputEl;
      }
    }
  }

  // 5. Last resort: match by name attribute containing the question number
  if (questionMatch) {
    const fullQNum = questionMatch[0];
    for (const input of Array.from(inputs)) {
      const inputEl = input as HTMLInputElement;
      if (inputEl.name.includes(fullQNum) && inputEl.id.includes(optionId.split('_').pop() || '')) {
        return inputEl;
      }
    }
  }

  return null;
}

// Get label text for an input element (for text-based verification) - Highly Scoped & Symmetric
function getInputLabelText(doc: Document, input: HTMLInputElement): string {
  try {
    // Find the question container (.que) first to scope our search
    const container = input.closest('.que') || doc;
    
    // 1. Try label[for=...] strictly inside the container
    if (input.id) {
      try {
        const lbl = container.querySelector(`label[for="${input.id}"]`);
        if (lbl) return cleanText(lbl.textContent || '');
      } catch (e) {
        console.warn(`[Fill] Selector exception for label[for="${input.id}"]:`, e);
      }
    }

    // 2. Try wrapping label
    const wrapLabel = input.closest('label');
    if (wrapLabel) {
      // Clone label and remove input element to avoid text pollution
      try {
        const clone = wrapLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input').forEach(i => i.remove());
        return cleanText(clone.textContent || '');
      } catch (e) {}
    }

    // 3. Try sibling label inside the immediate parent/option wrapper (e.g. .r0, .r1, .option, or parent div)
    const optionWrapper = input.closest('.r0, .r1, .option, .form-check, li, div');
    if (optionWrapper) {
      try {
        const lbl = optionWrapper.querySelector('label');
        if (lbl) return cleanText(lbl.textContent || '');
      } catch (e) {}
    }

    // 4. Ultimate parent-cloning fallback: if no label element exists, extract text from parent element directly
    const parent = input.parentElement;
    if (parent) {
      try {
        const clone = parent.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input, script, style').forEach(i => i.remove());
        return cleanText(clone.textContent || '');
      } catch (e) {}
    }
  } catch (e) {
    console.warn('[Fill] Exception in getInputLabelText:', e);
  }

  return '';
}

// Find input by OPTION TEXT within a specific question container (most reliable method)
function findInputByText(doc: Document, containerId: string, optionText: string): HTMLInputElement | null {
  let container: HTMLElement | null = null;
  try {
    container = doc.getElementById(containerId) as HTMLElement || (containerId ? doc.querySelector(`[id="${containerId}"]`) as HTMLElement : null);
  } catch (e) {
    console.warn(`[Fill] Selector exception in findInputByText for containerId "${containerId}":`, e);
  }
  if (!container) return null;

  try {
    const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    let bestMatch: HTMLInputElement | null = null;
    let bestScore = 0;

    const normalizedTarget = optionText.toLowerCase().replace(/\s+/g, ' ').trim();

    for (const input of Array.from(inputs)) {
      const inputEl = input as HTMLInputElement;
      const labelText = getInputLabelText(doc, inputEl).toLowerCase().replace(/\s+/g, ' ').trim();

      if (!labelText) continue;

      // Exact match
      if (labelText === normalizedTarget) return inputEl;

      // Check if one contains the other (handles minor formatting diffs)
      if (labelText.includes(normalizedTarget) || normalizedTarget.includes(labelText)) {
        const score = Math.min(labelText.length, normalizedTarget.length) / Math.max(labelText.length, normalizedTarget.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = inputEl;
        }
      }
    }

    // Accept if >70% similarity
    return bestScore > 0.7 ? bestMatch : null;
  } catch (e) {
    console.warn('[Fill] Exception inside findInputByText loop:', e);
    return null;
  }
}

// Fill answers on the page with TEXT-VERIFIED matching
// questions: the scraped question data (with option texts)
// answers: Record<containerID, optionID>
async function fillLmsAnswers(
  answers: Record<string, string>,
  questions?: { id: string; text: string; options: { id: string; text: string }[] }[]
): Promise<number> {
  if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
    console.warn('[Fill] No valid answers object provided to fill.');
    return 0;
  }

  let attempts = 0;
  const maxAttempts = 15;

  // Build a quick lookup: optionID -> option text (from scraped question data)
  const optionIdToText = new Map<string, string>();
  const optionIdToContainerId = new Map<string, string>();
  if (questions) {
    for (const q of questions) {
      for (const opt of q.options) {
        optionIdToText.set(opt.id, opt.text);
        optionIdToContainerId.set(opt.id, q.id);
      }
    }
  }

  // Wait until the target page has at least one quiz input
  while (attempts < maxAttempts) {
    let foundAny = false;
    const docsForWait = getRootDocuments();
    for (const doc of docsForWait) {
      try {
        if (doc && doc.querySelector('.que input[type="radio"], .que input[type="checkbox"]')) {
          foundAny = true;
          break;
        }
      } catch (e) {}
    }
    if (foundAny) break;
    console.log('Waiting for LMS page to render kuis elements, retrying in 300ms...');
    await new Promise(r => setTimeout(r, 300));
    attempts++;
  }

  // FRESHLY RE-QUERY DOCS FOR THE FILLING PHASE to prevent using stale/detached document references
  const docs = getRootDocuments();
  let filledCount = 0;

  for (const [qId, optionId] of Object.entries(answers)) {
    // Cari kontainer soal di semua document (termasuk iframe jika ada)
    let containerExists = false;
    for (const doc of docs) {
      if (!doc) continue;
      try {
        const container = doc.getElementById(qId) || (qId ? doc.querySelector(`[id="${qId}"]`) : null);
        if (container) {
          containerExists = true;
          break;
        }
      } catch (e) {}
    }
    // JIKA KONTAINER TIDAK ADA DI HALAMAN AKTIF, LEWATI! (Ini mencegah false-positive klik kuis halaman lain)
    if (!containerExists) {
      console.log(`[Fill] Skipping question ${qId} - not found on active page.`);
      continue;
    }

    // ── Check if the question is fill-in-the-blank (isian) ──
    const matchedQuestion = questions?.find(q => q.id === qId);
    const isTextInput = matchedQuestion?.options.length === 1 && matchedQuestion.options[0].text === '[isian]';

    if (isTextInput) {
      const textInputId = matchedQuestion.options[0].id;
      let textInputEl: HTMLInputElement | HTMLTextAreaElement | null = null;
      let inputDoc: Document | null = null;

      for (const doc of docs) {
        if (!doc) continue;
        try {
          textInputEl = (doc.getElementById(textInputId) || doc.querySelector(`[name="${textInputId}"]`) || doc.querySelector(`[id="${textInputId}"]`)) as HTMLInputElement | HTMLTextAreaElement;
          if (!textInputEl) {
            // Sibling fallback search inside container
            const container = doc.getElementById(qId) || (qId ? doc.querySelector(`[id="${qId}"]`) : null);
            if (container) {
              const textInputs = container.querySelectorAll('input[type="text"], input[type="number"], textarea');
              if (textInputs.length > 0) {
                textInputEl = textInputs[0] as HTMLInputElement | HTMLTextAreaElement;
              }
            }
          }
          if (textInputEl) {
            inputDoc = doc;
            break;
          }
        } catch (e) {}
      }

      if (textInputEl && inputDoc) {
        try {
          textInputEl.focus();
          
          // Use native value setter to bypass Virtual DOM overrides
          const nativeSetter = Object.getOwnPropertyDescriptor(
            textInputEl instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
            'value'
          )?.set;
          
          if (nativeSetter) {
            nativeSetter.call(textInputEl, optionId);
          } else {
            textInputEl.value = optionId;
          }

          textInputEl.dispatchEvent(new Event('input', { bubbles: true }));
          textInputEl.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Fill] Filled Short Answer/Essay: "${optionId}" for Question: ${qId}`);
          filledCount++;
        } catch (e) {
          console.error(`[Fill] Exception filling text input for question ${qId}:`, e);
        }
      } else {
        console.error(`[Fill] Could not find text input for question ${qId}`);
      }
      continue;
    }

    let input: HTMLInputElement | null = null;
    let targetDoc: Document | null = null;

    for (const doc of docs) {
      if (!doc) continue;
      try {
        // ── Strategy 1: Find by ID (fast path) ──
        const elById = findInputElement(doc, optionId);

        if (elById) {
          // ── TEXT VERIFICATION: check that the label matches the expected option text ──
          const expectedText = optionIdToText.get(optionId);
          if (expectedText) {
            const actualLabel = getInputLabelText(doc, elById);
            const normalizedExpected = expectedText.toLowerCase().replace(/\s+/g, ' ').trim();
            const normalizedActual = actualLabel.toLowerCase().replace(/\s+/g, ' ').trim();

            if (normalizedActual && normalizedActual.includes(normalizedExpected.substring(0, 20))) {
              // Label matches — this is the correct input
              input = elById;
              targetDoc = doc;
            } else {
              // Label MISMATCH — the ID-based match found the wrong input!
              console.warn(`[Fill] ID match found but label mismatch for ${optionId}: expected "${expectedText.substring(0, 40)}" but got "${actualLabel.substring(0, 40)}". Trying text-based search...`);

              // ── Strategy 2: Find by TEXT within the question container ──
              const containerId = optionIdToContainerId.get(optionId) || qId;
              const textMatch = findInputByText(doc, containerId, expectedText);
              if (textMatch) {
                console.log(`[Fill] Text-based match found for "${expectedText.substring(0, 40)}"`);
                input = textMatch;
                targetDoc = doc;
              } else {
                // Fallback to the ID-based match (better than nothing)
                console.warn(`[Fill] Text search also failed. Using ID-based match as fallback.`);
                input = elById;
                targetDoc = doc;
              }
            }
          } else {
            // No expected text available — trust the ID-based match
            input = elById;
            targetDoc = doc;
          }
          break;
        } else {
          // ── Strategy 2: ID not found — try TEXT-based search ──
          const expectedText = optionIdToText.get(optionId);
          const containerId = optionIdToContainerId.get(optionId) || qId;
          if (expectedText) {
            const textMatch = findInputByText(doc, containerId, expectedText);
            if (textMatch) {
              console.log(`[Fill] No ID match but text-based match found for "${expectedText.substring(0, 40)}"`);
              input = textMatch;
              targetDoc = doc;
              break;
            }
          }
        }
      } catch (e) {
        console.warn(`[Fill] Safety catch: error finding element in doc for ${optionId}:`, e);
      }
    }

    if (input && targetDoc) {
      try {
        if (!input.checked) {
          let label: HTMLElement | null = null;
          try {
            if (input.id) {
              label = targetDoc.querySelector(`label[for="${input.id}"]`) as HTMLElement;
            }
          } catch (e) {}
          const target = label || input;
          console.log(`[Fill] Clicking Option ID: ${input.id} (Verified Label: "${getInputLabelText(targetDoc, input)}") for Question: ${qId}`);
          await animateCursorAndClick(target, 120);
        } else {
          console.log(`[Fill] Option ID: ${input.id} is already checked/filled for Question: ${qId}`);
        }
        filledCount++;
      } catch (e) {
        console.error(`[Fill] Exception clicking Option ${optionId} for question ${qId}:`, e);
      }
    } else {
      console.error(`[Fill] Could not find input for question ${qId}, option ${optionId}`);
    }
  }
  return filledCount;
}

// Start Quiz / Attempt Quiz Now Button Detector
function getLmsStartQuizButton(): HTMLElement | null {
  const docs = getRootDocuments();
  for (const doc of docs) {
    const selectors = [
      'input[value*="Attempt"]',
      'input[value*="kuis"]',
      'input[value*="Lanjutkan"]',
      'button.btn-primary',
      '.quizattempt button',
      'form[action*="attempt.php"] button',
      'form[action*="attempt.php"] input[type="submit"]'
    ];
    
    for (const sel of selectors) {
      const btn = doc.querySelector(sel);
      if (btn) return btn as HTMLElement;
    }
    
    // Text search fallback
    const allElements = Array.from(doc.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
    const startBtn = allElements.find(el => {
      const text = (el.textContent || (el as HTMLInputElement).value || '').toLowerCase().trim();
      return text.includes('attempt quiz') || 
             text.includes('lanjutkan kuis') || 
             text.includes('lanjutkan percobaan') || 
             text.includes('mulai kuis') ||
             text.includes('start attempt') ||
             text.includes('continue attempt');
    });
    
    if (startBtn) return startBtn as HTMLElement;
  }
  return null;
}

// Get Next Button (Search limited strictly to quiz response forms)
function getLmsNextButton(): HTMLElement | null {
  const docs = getRootDocuments();
  for (const doc of docs) {
    const form = doc.getElementById('responseform') || doc.querySelector('form');
    if (!form) continue;

    const selectors = [
      'input[name="next"]',
      'button[name="next"]',
      'input[value="Next page"]',
      'input[value="Next"]'
    ];
    for (const sel of selectors) {
      const btn = form.querySelector(sel);
      if (btn) {
        const val = ((btn as HTMLInputElement).value || btn.textContent || '').toLowerCase();
        // EXCLUDE finish attempt button masquerading as next
        if (val.includes('finish') || val.includes('selesai') || val.includes('attempt')) {
          continue;
        }
        return btn as HTMLElement;
      }
    }

    // Text search fallback inside the kuis form ONLY
    const allBtns = Array.from(form.querySelectorAll('input[type="submit"], button, a'));
    const nextBtn = allBtns.find(el => {
      const text = (el.textContent || (el as HTMLInputElement).value || '').toLowerCase().trim();
      if (text.includes('finish') || text.includes('selesai') || text.includes('attempt')) {
        return false;
      }
      return text === 'next page' || text === 'next' || text === 'selanjutnya';
    });

    if (nextBtn) return nextBtn as HTMLElement;
  }
  return null;
}

// Get Finish Attempt Button (Search limited strictly to quiz response forms)
function getLmsFinishButton(): HTMLElement | null {
  const docs = getRootDocuments();
  for (const doc of docs) {
    const form = doc.getElementById('responseform') || doc.querySelector('form');
    if (!form) continue;

    const selectors = [
      'input[name="finishattempt"]',
      'button[name="finishattempt"]',
      'input[value="Finish attempt"]',
      'input[value="Finish"]'
    ];
    for (const sel of selectors) {
      const btn = form.querySelector(sel);
      if (btn) return btn as HTMLElement;
    }

    // In some Moodle versions, the finish attempt button has name="next" but text contains finish
    const finishBtnNameNext = form.querySelector('input[name="next"], button[name="next"]');
    if (finishBtnNameNext) {
      const val = ((finishBtnNameNext as HTMLInputElement).value || finishBtnNameNext.textContent || '').toLowerCase();
      if (val.includes('finish') || val.includes('selesai') || val.includes('attempt')) {
        return finishBtnNameNext as HTMLElement;
      }
    }

    // Text search fallback inside the kuis form ONLY
    const allBtns = Array.from(form.querySelectorAll('input[type="submit"], button, a'));
    const finishBtn = allBtns.find(el => {
      const text = (el.textContent || (el as HTMLInputElement).value || '').toLowerCase().trim();
      return text === 'finish attempt' || text === 'finish' || text === 'selesai' || text === 'selesaikan kuis' || text.includes('finish attempt');
    });

    if (finishBtn) return finishBtn as HTMLElement;
  }
  return null;
}

// Get Previous Page Button (Search limited strictly to quiz response forms)
function getLmsPreviousButton(): HTMLElement | null {
  const docs = getRootDocuments();
  for (const doc of docs) {
    const form = doc.getElementById('responseform') || doc.querySelector('form');
    if (!form) continue;

    // Direct selectors
    const selectors = [
      'input[name="previous"]',
      'button[name="previous"]',
      'input[value="Previous page"]',
      'input[value="Previous"]'
    ];
    for (const sel of selectors) {
      const btn = form.querySelector(sel);
      if (btn) return btn as HTMLElement;
    }

    // Text search fallback inside the kuis form ONLY
    const allBtns = Array.from(form.querySelectorAll('input[type="submit"], button, a'));
    const prevBtn = allBtns.find(el => {
      const text = (el.textContent || (el as HTMLInputElement).value || '').toLowerCase().trim();
      return text === 'previous page' || text === 'previous' || text === 'sebelumnya' || text === 'halaman sebelumnya';
    });

    if (prevBtn) return prevBtn as HTMLElement;
  }
  return null;
}

// Jump to page 1 link
function jumpToPage1(): boolean {
  const docs = getRootDocuments();
  for (const doc of docs) {
    const firstPageLink = Array.from(doc.querySelectorAll('.qnbutton, .page-link, .quiznavigation a')).find(el => {
      return el.textContent?.trim() === '1';
    }) as HTMLElement;

    if (firstPageLink) {
      firstPageLink.click();
      return true;
    }
  }
  return false;
}

// Message listener
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message.type === 'SCRAPE_LMS') {
    const questions = scrapeLmsQuestions();
    const hasNext = !!getLmsNextButton();
    const hasFinish = !!getLmsFinishButton();
    const hasPrevious = !!getLmsPreviousButton();
    const startBtn = getLmsStartQuizButton();
    
    sendResponse({ 
      questions, 
      hasNext, 
      hasFinish, 
      hasPrevious,
      hasStartBtn: !!startBtn 
    });
    return true;
  }

  if (message.type === 'CLICK_START_QUIZ') {
    const startBtn = getLmsStartQuizButton();
    if (startBtn) {
      animateCursorAndClick(startBtn, 250).then(() => {
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: 'Start kuis button not found' });
    }
    return true;
  }

  if (message.type === 'FILL_ANSWERS') {
    fillLmsAnswers(message.payload.answers, message.payload.questions).then((filledCount) => {
      sendResponse({ filledCount });
    });
    return true;
  }

  if (message.type === 'CLICK_NEXT_LMS') {
    const nextBtn = getLmsNextButton();
    if (nextBtn) {
      animateCursorAndClick(nextBtn, 250).then(() => {
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: 'Next button not found' });
    }
    return true;
  }

  if (message.type === 'CLICK_FINISH_LMS') {
    const finishBtn = getLmsFinishButton();
    if (finishBtn) {
      animateCursorAndClick(finishBtn, 250).then(() => {
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: 'Finish button not found' });
    }
    return true;
  }

  if (message.type === 'JUMP_TO_PAGE_1') {
    const success = jumpToPage1();
    sendResponse({ success });
    return true;
  }

  if (message.type === 'CLICK_PREVIOUS_LMS') {
    const prevBtn = getLmsPreviousButton();
    if (prevBtn) {
      animateCursorAndClick(prevBtn, 250).then(() => {
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: 'Previous button not found' });
    }
    return true;
  }

  // AI INTERFACES
  if (message.type === 'INJECT_AI_PROMPT') {
    const { prompt } = message.payload;
    injectPromptToAi(prompt).then((success) => {
      sendResponse({ success });
    });
    return true;
  }

  if (message.type === 'WAIT_AND_EXTRACT_AI') {
    waitForAiResponse().then((answers) => {
      sendResponse({ answers });
    });
    return true;
  }
});

// Helper to set React input value (bypassing virtual DOM state interception)
function setReactInputValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Helper to set ContentEditable value cleanly (Claude, Gemini)
function setContentEditableValue(el: HTMLElement, value: string) {
  el.focus();
  try {
    document.execCommand('selectAll', false, undefined);
    document.execCommand('insertText', false, value);
  } catch (e) {
    el.innerText = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Gold-standard text pasting for complex rich text editors (Lexical, Slate, ProseMirror)
async function pasteTextUsingDocumentCommand(el: HTMLElement, text: string): Promise<boolean> {
  el.focus();
  
  // Method 1: execCommand('insertText') - Absolute gold standard for rich editors
  try {
    document.execCommand('selectAll', false, undefined);
    const success = document.execCommand('insertText', false, text);
    if (success) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  } catch (e) {
    console.warn('[Paste] execCommand failed, trying fallback...', e);
  }

  // Method 2: Synthetic Clipboard Paste Event
  try {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboardData
    });
    el.dispatchEvent(pasteEvent);
    await new Promise(r => setTimeout(r, 50));
  } catch (e) {
    console.warn('[Paste] Clipboard paste failed, trying fallback...', e);
  }

  // Method 3: Standard Native React state bypass
  if (el.tagName === 'TEXTAREA' || 'value' in el) {
    setReactInputValue(el as HTMLTextAreaElement, text);
  } else {
    setContentEditableValue(el, text);
  }
  return true;
}

// Standard keyboard event simulator that mimics physical Enter key sequence exactly
function simulateEnterKeyPress(el: HTMLElement) {
  const eventInit = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    view: window
  };

  el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
  el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
  
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const form = el.closest('form');
    if (form) {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
    }
  }

  el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
}

// Comprehensive send button finder for all AI platforms
function findSendButton(host: string): HTMLElement | null {
  const selectors = [
    // ChatGPT
    'button[data-testid="send-button"]',
    'button[data-testid="fruitjuice-send-button"]',
    // Claude
    'button[aria-label="Send message"]',
    'button[aria-label="Send Prompt"]',
    'button[aria-label="Send Message"]',
    'button.cc-send-button',
    // Gemini
    'button[aria-label="Send message"]',
    'button[aria-label="Send Message"]',
    'button.send-button',
    // DeepSeek
    'button[aria-label="Send message"]',
    'button.ds-icon-send',
    'button[aria-label="Send"]',
    // General
    'form button[type="submit"]',
    'button.send',
    'button.submit'
  ];

  for (const sel of selectors) {
    const btn = document.querySelector(sel);
    if (btn) return btn as HTMLElement;
  }

  // Text/SVG fallback scan
  const allBtns = Array.from(document.querySelectorAll('button'));
  const found = allBtns.find(btn => {
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
    const text = (btn.textContent || '').toLowerCase();
    return label.includes('send') || label.includes('submit') || 
           testId.includes('send') || testId.includes('submit') ||
           text.includes('send') || text.includes('submit') ||
           btn.querySelector('svg');
  });

  return found || null;
}

// AI Injector & Extractor
async function injectPromptToAi(prompt: string): Promise<boolean> {
  const host = window.location.hostname;
  
  // Find textarea or input on current AI page
  const textarea = document.querySelector('#prompt-textarea') || 
                   document.querySelector('div[contenteditable="true"]') ||
                   document.querySelector('#chat-input') ||
                   document.querySelector('textarea') ||
                   document.querySelector('[contenteditable="true"]');

  if (!textarea) {
    console.error('Could not find prompt textarea');
    return false;
  }

  // Paste text using our gold-standard editor bypass
  await pasteTextUsingDocumentCommand(textarea as HTMLElement, prompt);

  // Active polling: wait up to 1.5 seconds for React to register the value and enable the send button
  let sendButton: HTMLElement | null = null;
  let buttonEnabled = false;
  
  for (let i = 0; i < 15; i++) {
    sendButton = findSendButton(host);
    if (sendButton && !sendButton.hasAttribute('disabled') && !sendButton.classList.contains('disabled')) {
      buttonEnabled = true;
      break;
    }
    await new Promise(r => setTimeout(r, 100)); // Poll every 100ms
  }

  // If send button is found and enabled, click it. Otherwise fallback to Enter key
  if (buttonEnabled && sendButton) {
    console.log('React state sync complete. Clicking Send Button on AI...');
    sendButton.click();
    return true;
  } else {
    console.log('Send button disabled or missing. Triggering physical Enter key sequence...');
    simulateEnterKeyPress(textarea as HTMLElement);
    return true;
  }
}

// Helper to clean up markdown and extract JSON containing the answers key balance-checked
function cleanAndParseJson(text: string): any {
  let cleanText = text.trim();
  
  // Strip markdown fences
  if (cleanText.includes('```')) {
    const lines = cleanText.split('\n');
    const filtered = lines.filter(line => !line.trim().startsWith('```'));
    cleanText = filtered.join('\n').trim();
  }

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // Advanced balanced brace extractor
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const balancingAct = cleanText.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(balancingAct);
      } catch (innerErr) {
        // Fallback fixing trailing commas before closing braces
        try {
          const fixedComma = balancingAct.replace(/,\s*([\]}])/g, '$1');
          return JSON.parse(fixedComma);
        } catch (commaErr) {
          throw innerErr;
        }
      }
    }
    throw e;
  }
}

// Safely monitors AI response generation complete state without getting stuck
async function waitForAiResponse(): Promise<Record<string, string> | null> {
  const host = window.location.hostname;
  
  // CRITICAL: Fast 2-second initial wait to allow the AI interface to receive the prompt,
  // contact backend, and spawn the "Stop Generating" button/state.
  await new Promise(r => setTimeout(r, 2000));

  let isGenerating = true;
  let attempts = 0;
  const maxAttempts = 120; // 2 minutes max

  while (isGenerating && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 1000));
    attempts++;

    if (host.includes('chatgpt.com')) {
      const stopBtn = document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]');
      const sendBtn = document.querySelector('button[data-testid="send-button"]');
      isGenerating = !!stopBtn || !sendBtn;
    } else if (host.includes('claude.ai')) {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[aria-label="Stop Response"]');
      const sendBtn = document.querySelector('button[aria-label="Send message"]');
      isGenerating = !!stopBtn || !sendBtn;
    } else if (host.includes('gemini.google.com')) {
      const stopBtn = document.querySelector('button[aria-label="Stop generation"]');
      const sendBtn = document.querySelector('button[aria-label="Send message"]');
      isGenerating = !!stopBtn || !sendBtn;
    } else if (host.includes('deepseek.com')) {
      const stopBtn = document.querySelector('.ds-icon-stop, button[aria-label="Stop generating"]');
      const sendBtn = document.querySelector('button[aria-label="Send message"], button.ds-icon-send');
      isGenerating = !!stopBtn || !sendBtn;
    } else {
      isGenerating = false;
    }
  }

  // Active polling complete, extract text
  let responseText = '';
  if (host.includes('chatgpt.com')) {
    const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (messages.length > 0) {
      responseText = messages[messages.length - 1].textContent || '';
    } else {
      const proseMsgs = document.querySelectorAll('.markdown.prose');
      if (proseMsgs.length > 0) {
        responseText = proseMsgs[proseMsgs.length - 1].textContent || '';
      }
    }
  } else if (host.includes('claude.ai')) {
    const messages = document.querySelectorAll('.font-claude-message, .prose');
    if (messages.length > 0) {
      responseText = messages[messages.length - 1].textContent || '';
    }
  } else if (host.includes('gemini.google.com')) {
    const messages = document.querySelectorAll('.message-content, .message-text');
    if (messages.length > 0) {
      responseText = messages[messages.length - 1].textContent || '';
    }
  } else if (host.includes('deepseek.com')) {
    const messages = document.querySelectorAll('.ds-markdown, .ds-message-item--assistant');
    if (messages.length > 0) {
      responseText = messages[messages.length - 1].textContent || '';
    }
  } else {
    const blocks = document.querySelectorAll('pre, code, div');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const text = blocks[i].textContent || '';
      if (text.includes('"answers"') || text.includes('answers')) {
        responseText = text;
        break;
      }
    }
  }

  // Parse JSON containing the answers object using our robust cleanAndParseJson helper
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*?"answers"[\s\S]*?\}/) || responseText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = cleanAndParseJson(jsonMatch[0]);
      if (parsed && parsed.answers) {
        return parsed.answers;
      }
    }
  } catch (e) {
    console.error('Failed to parse AI JSON response:', e);
  }

  return null;
}
