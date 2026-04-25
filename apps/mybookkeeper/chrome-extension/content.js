/** @typedef {{ field_name: string; line: string; value: string | number }} FormField */

// --- Form detection ---

const FORM_DETECT_PATTERNS = [
  { form: "w2", url: /\bw[\s._-]?2\b/i, heading: /\bw[\s-]?2\b|wages,?\s*tips/i },
  { form: "1099_nec", url: /1099[\s._-]?nec/i, heading: /1099[\s-]?nec/i },
  { form: "1099_misc", url: /1099[\s._-]?misc/i, heading: /1099[\s-]?misc/i },
  { form: "1099_int", url: /1099[\s._-]?int/i, heading: /1099[\s-]?int/i },
  { form: "1099_div", url: /1099[\s._-]?div/i, heading: /1099[\s-]?div/i },
  { form: "1099_b", url: /1099[\s._-]?b\b/i, heading: /1099[\s-]?b\b/i },
  { form: "1099_k", url: /1099[\s._-]?k\b/i, heading: /1099[\s-]?k\b/i },
  { form: "1099_r", url: /1099[\s._-]?r\b/i, heading: /1099[\s-]?r\b/i },
  { form: "1098", url: /\b1098\b/i, heading: /\b1098\b/i },
  { form: "schedule_e", url: /schedule[\s._-]?e\b|rental[\s._-]?income|supplemental[\s._-]?income/i, heading: /schedule\s*e\b|rental\s*(property\s*)?income|supplemental\s*income/i },
  { form: "schedule_c", url: /schedule[\s._-]?c\b|business[\s._-]?income|self[\s._-]?employ|profit[\s._-]?(or|and)[\s._-]?loss/i, heading: /schedule\s*c\b|business\s*(income|profit)|profit\s*(or|and)\s*loss|self.employ/i },
  { form: "1040", url: /\b1040\b/i, heading: /\bform\s*1040\b|individual.*tax.*return/i },
];

const FORM_FIELD_SIGNATURES = {
  w2: ["wages, tips, other compensation", "social security wages", "medicare wages and tips"],
  schedule_e: ["rents received", "cleaning and maintenance", "depreciation", "utilities", "repairs"],
  schedule_c: ["gross receipts", "car and truck expenses", "contract labor", "business use of home"],
  "1040": ["adjusted gross income", "taxable income", "total income"],
  "1099_misc": ["medical and health care payments", "payer made direct sales", "crop insurance proceeds"],
  "1099_nec": ["nonemployee compensation"],
  "1099_int": ["interest income received", "early withdrawal penalty", "us savings bond interest"],
  "1099_div": ["total ordinary dividends", "qualified dividends", "total capital gain"],
  "1099_b": ["proceeds", "cost or other basis", "wash sale loss"],
  "1099_k": ["gross amount"],
  "1098": ["mortgage interest received", "outstanding mortgage principal", "mortgage insurance premiums"],
};

function detectForm() {
  const url = window.location.href;
  const title = document.title;

  for (const p of FORM_DETECT_PATTERNS) {
    if (p.url.test(url) || p.heading.test(title)) return p.form;
  }

  for (const el of document.querySelectorAll("h1, h2, h3, h4")) {
    const text = el.textContent || "";
    for (const p of FORM_DETECT_PATTERNS) {
      if (p.heading.test(text)) return p.form;
    }
  }

  return detectFormFromFields();
}

function detectFormFromFields() {
  const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (
    document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select")
  );
  /** @type {string[]} */
  const pageLabels = [];
  for (const input of inputs) {
    const label = getLabelText(input);
    if (label) pageLabels.push(label);
  }
  if (pageLabels.length === 0) return null;

  let bestForm = null;
  let bestScore = 0;

  for (const [form, sigs] of Object.entries(FORM_FIELD_SIGNATURES)) {
    let matches = 0;
    for (const sig of sigs) {
      if (pageLabels.some((pl) => fuzzyMatch(pl, sig))) matches++;
    }
    const minMatches = sigs.length === 1 ? 1 : 2;
    if (matches >= minMatches) {
      const score = matches / sigs.length;
      if (score > bestScore) { bestForm = form; bestScore = score; }
    }
  }

  return bestForm;
}

/** Detect tax year from URL, page title, or headings. */
function detectTaxYear() {
  const currentYear = new Date().getFullYear();
  const yearRe = /\b(20[1-9]\d)\b/;

  const urlMatch = window.location.href.match(yearRe);
  if (urlMatch) {
    const y = parseInt(urlMatch[1]);
    if (y >= 2018 && y <= currentYear) return y;
  }

  const titleMatch = document.title.match(yearRe);
  if (titleMatch) {
    const y = parseInt(titleMatch[1]);
    if (y >= 2018 && y <= currentYear) return y;
  }

  for (const el of document.querySelectorAll("h1, h2, h3")) {
    const m = (el.textContent || "").match(yearRe);
    if (m) {
      const y = parseInt(m[1]);
      if (y >= 2018 && y <= currentYear) return y;
    }
  }

  return null;
}

// Proactively notify side panel on page load and SPA navigation
let lastDetectedForm = /** @type {string | null} */ (null);
let lastDetectedYear = /** @type {number | null} */ (null);
let detectTimer = /** @type {number | null} */ (null);

function checkAndNotify() {
  const form = detectForm();
  const year = detectTaxYear();
  if (form !== lastDetectedForm || year !== lastDetectedYear) {
    lastDetectedForm = form;
    lastDetectedYear = year;
    chrome.runtime.sendMessage({ action: "pageDetected", form, year }).catch(() => {});
  }
}

function scheduleCheck() {
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = setTimeout(checkAndNotify, 400);
}

checkAndNotify();

// Re-check on any significant DOM change (SPAs like FreeTaxUSA
// swap page content without changing the URL)
new MutationObserver(scheduleCheck).observe(document, { subtree: true, childList: true });

window.addEventListener("popstate", scheduleCheck);
window.addEventListener("hashchange", scheduleCheck);

// --- Field mappings ---

const FIELD_MAPPINGS = {
  // Payer / issuer identification
  "financial institution": "payer_name",
  "payer's name": "payer_name",
  "payer name": "payer_name",
  // W-2 (most specific labels first to prevent 1040 "wages" from stealing W-2 inputs)
  "wages, tips, other compensation": "box_1",
  "wages, tips": "box_1",
  "federal income tax withheld": "box_2",
  "social security wages": "box_3",
  "social security tax withheld": "box_4",
  "social security tax": "box_4",
  "medicare wages and tips": "box_5",
  "medicare wages": "box_5",
  "medicare tax withheld": "box_6",
  "medicare tax": "box_6",
  // Schedule E
  "rents received": "line_3",
  "advertising": "line_5",
  "auto and travel": "line_6",
  "cleaning and maintenance": "line_7",
  "commissions": "line_8",
  "insurance": "line_9",
  "legal and professional": "line_10",
  "mortgage interest": "line_12",
  "repairs": "line_14",
  "taxes": "line_16",
  "utilities": "line_17",
  "depreciation": "line_18",
  "other expenses": "line_19",
  // Schedule C
  "gross receipts": "line_1",
  "car and truck expenses": "line_9",
  "contract labor": "line_11",
  "office expense": "line_18",
  "supplies": "line_22",
  "travel expenses": "line_24a",
  "meals": "line_24b",
  "business use of home": "line_30",
  "net profit": "line_29",
  "total expenses": "line_28",
  // 1040 (generic "wages" last to avoid stealing W-2 inputs)
  "wages": "line_1a",
  "interest income": "line_2b",
  "dividend income": "line_3b",
  "rental real estate": "line_5",
  "total income": "line_9",
  "adjusted gross income": "line_11",
  "taxable income": "line_15",
  "tax": "line_16",
  // 1099-INT
  "interest income received": "box_1",
  "early withdrawal penalty": "box_2",
  "us savings bond interest": "box_3",
  // 1099-DIV
  "total ordinary dividends": "box_1a",
  "qualified dividends": "box_1b",
  "total capital gain": "box_2a",
  // 1099-B
  "proceeds": "box_1d",
  "cost or other basis": "box_1e",
  "wash sale loss": "box_1g",
  // 1099-MISC
  "rents": "box_1",
  "royalties": "box_2",
  "other income": "box_3",
  "fishing boat proceeds": "box_5",
  "medical and health care payments": "box_6",
  "payer made direct sales": "box_7",
  "direct sales": "box_7",
  "substitute payments": "box_8",
  "crop insurance proceeds": "box_9",
  "gross proceeds paid to an attorney": "box_10",
  "attorney": "box_10",
  "fish purchased for resale": "box_11",
  "section 409a deferrals": "box_12",
  "nonqualified deferred compensation": "box_13",
  "fatca filing requirement": "box_14",
  // 1099-NEC
  "nonemployee compensation": "box_1",
  // 1099-K
  "gross amount": "box_1a",
  // 1098
  "mortgage interest received": "box_1",
  "mortgage interest": "box_1",
  "outstanding mortgage principal": "box_2",
  "mortgage origination date": "box_3",
  "refund of overpaid interest": "box_4",
  "mortgage insurance premiums": "box_5",
  "points paid on purchase of principal residence": "box_6",
  "points paid": "box_6",
  "property securing the mortgage": "box_8",
  "lender name": "payer_name",
};

const REVERSE_FIELD_MAPPINGS = Object.fromEntries(
  Object.entries(FIELD_MAPPINGS).map(([label, line]) => [line, label])
);

/**
 * Set value on an input and dispatch events so the site's framework picks it up.
 * @param {HTMLInputElement | HTMLSelectElement} inputElement
 * @param {string} value
 */
function autoFillField(inputElement, value) {
  const type = inputElement.type;

  if (type === "checkbox") {
    const shouldCheck = value === true || value === "true" || value === "1" || value === "yes";
    if (inputElement.checked !== shouldCheck) {
      inputElement.checked = shouldCheck;
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      inputElement.dispatchEvent(new Event("click", { bubbles: true }));
    }
  } else if (type === "radio") {
    const strVal = String(value).toLowerCase();
    if (inputElement.value.toLowerCase() === strVal || inputElement.labels?.[0]?.textContent?.toLowerCase().includes(strVal)) {
      inputElement.checked = true;
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      inputElement.dispatchEvent(new Event("click", { bubbles: true }));
    }
  } else {
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set ??
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(inputElement, value);
    } else {
      inputElement.value = value;
    }

    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    inputElement.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  inputElement.classList.add("mbk-filled", "mbk-filled-flash");
  setTimeout(() => inputElement.classList.remove("mbk-filled-flash"), 1500);

  // Add a green dot badge next to checkboxes/radios for visibility
  if ((type === "checkbox" || type === "radio") && !inputElement.nextElementSibling?.classList?.contains("mbk-filled-badge")) {
    const badge = document.createElement("span");
    badge.className = "mbk-filled-badge";
    badge.title = "Auto-filled by MyBookkeeper";
    inputElement.insertAdjacentElement("afterend", badge);
  }
}

/**
 * Normalize text for fuzzy matching: lowercase, strip non-alphanumeric except spaces.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

/** Naive stemming: strip trailing 's' from words for better matching. */
function stem(word) {
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Expand common tax field synonyms so fuzzy matching works across sites. */
const SYNONYMS = [
  [/\btin\b/, "taxpayer id number"],
  [/\bssn\b/, "social security number"],
  [/\bein\b/, "employer id number"],
];

function expandSynonyms(text) {
  let result = text;
  for (const [pattern, replacement] of SYNONYMS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Find the label text associated with an input element.
 * @param {HTMLInputElement | HTMLSelectElement} input
 * @returns {string}
 */
function getLabelText(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  const parent = input.closest("label");
  if (parent?.textContent) return parent.textContent.trim();

  const prev = input.previousElementSibling;
  if (prev?.tagName === "LABEL" && prev.textContent) {
    return prev.textContent.trim();
  }

  const ariaLabel = input.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();

  const placeholder = input.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();

  return "";
}

/**
 * Check if two normalized strings are a fuzzy match.
 * Returns true if one contains the other, or if they share enough words.
 * Requires minimum 2 words for word-overlap matching AND 60% overlap in both directions.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function fuzzyMatch(a, b) {
  const na = expandSynonyms(normalize(a));
  const nb = expandSynonyms(normalize(b));

  if (na === nb) return true;
  const shorterStr = na.length <= nb.length ? na : nb;
  if (shorterStr.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;

  const wordsA = na.split(/\s+/).filter((w) => w.length > 1).map(stem);
  const wordsB = nb.split(/\s+/).filter((w) => w.length > 1).map(stem);

  if (wordsA.length < 1 || wordsB.length < 1) return false;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const matchCount = wordsB.filter((w) => setA.has(w)).length;

  // If the shorter phrase has all its words in the longer one, match
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longerSet = wordsA.length <= wordsB.length ? setB : setA;
  const allShorterMatch = shorter.every((w) => longerSet.has(w));
  if (allShorterMatch && shorter.length >= 1) return true;

  // Otherwise require 50% overlap in both directions
  return matchCount >= 1 && matchCount / wordsB.length >= 0.5 && matchCount / wordsA.length >= 0.4;
}

/**
 * Build a map from line identifiers to input elements on the page.
 * @returns {Map<string, HTMLInputElement | HTMLSelectElement>}
 */
function buildPageFieldMap() {
  /** @type {Map<string, HTMLInputElement | HTMLSelectElement>} */
  const fieldMap = new Map();

  const inputs = /** @type {NodeListOf<HTMLInputElement | HTMLSelectElement>} */ (
    document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select")
  );

  for (const input of inputs) {
    const labelText = getLabelText(input);
    if (!labelText) continue;

    for (const [mappingLabel, lineId] of Object.entries(FIELD_MAPPINGS)) {
      if (fuzzyMatch(labelText, mappingLabel)) {
        fieldMap.set(lineId, input);
        break;
      }
    }

    const inputName = normalize(input.name ?? "");
    const inputId = normalize(input.id ?? "");
    const alreadyMapped = new Set(fieldMap.values());
    for (const [, lineId] of Object.entries(FIELD_MAPPINGS)) {
      if (fieldMap.has(lineId)) continue;
      if (alreadyMapped.has(input)) break;
      const normalizedLine = normalize(lineId);
      if (inputName.includes(normalizedLine) || inputId.includes(normalizedLine)) {
        fieldMap.set(lineId, input);
        break;
      }
    }
  }

  return fieldMap;
}

/**
 * Handle the auto-fill message from the popup.
 * @param {{ fields: FormField[]; formName: string }} data
 * @returns {{ success: boolean; filledCount: number; error?: string }}
 */
function handleAutoFill(data) {
  const { fields } = data;

  if (!fields || fields.length === 0) {
    return { success: true, filledCount: 0 };
  }

  // Scrape all form inputs on the page and index by their label text.
  // This works on ANY tax site regardless of its specific HTML structure.
  const allInputs = /** @type {NodeListOf<HTMLInputElement | HTMLSelectElement>} */ (
    document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]), select"
    )
  );

  /** @type {Array<{ label: string; normalized: string; input: HTMLInputElement | HTMLSelectElement }>} */
  const pageFields = [];
  for (const input of allInputs) {
    const label = getLabelText(/** @type {HTMLInputElement} */ (input));
    // Use label text, input name, or input id — whichever is available
    const text = label || input.name || input.id || "";
    if (text) {
      // Index by all available identifiers for broader matching
      pageFields.push({ label: text, normalized: normalize(text), input: /** @type {HTMLInputElement} */ (input) });
      // Also index by name/id separately if label was used (allows matching by name too)
      if (label && input.name && normalize(input.name) !== normalize(label)) {
        pageFields.push({ label: input.name, normalized: normalize(input.name), input: /** @type {HTMLInputElement} */ (input) });
      }
    }
  }

  // Also try the static FIELD_MAPPINGS as a secondary lookup
  const staticMap = buildPageFieldMap();

  console.log("[MBK] v1.0.2 — Page fields found:", pageFields.length);
  pageFields.forEach((pf) => console.log("[MBK]   input:", pf.input.id || pf.input.name || "?", "→", pf.label.substring(0, 80)));
  console.log("[MBK] Our fields:", fields.length);
  fields.forEach((f) => console.log("[MBK]   ", f.field_name, "=", String(f.value).substring(0, 20)));

  let filledCount = 0;
  const usedInputs = new Set();

  for (const field of fields) {
    let input = null;

    // 1. Fuzzy-match field_name against page labels (primary — works on any site)
    if (field.field_name) {
      const nfn = expandSynonyms(normalize(field.field_name));
      const fnWords = nfn.split(/\s+/).filter((w) => w.length > 1).map(stem);
      let bestScore = 0;

      for (const pf of pageFields) {
        if (usedInputs.has(pf.input)) continue;
        const npf = expandSynonyms(pf.normalized);

        // Exact match
        if (npf === nfn) { input = pf.input; bestScore = Infinity; break; }

        // Substring containment — score by length similarity
        // Require the shorter string to be at least 4 chars to prevent "no" matching "nonqualified" etc.
        const shorter = nfn.length <= npf.length ? nfn : npf;
        if (shorter.length >= 4 && (npf.includes(nfn) || nfn.includes(npf))) {
          const score = 1 + Math.min(nfn.length, npf.length) / Math.max(nfn.length, npf.length);
          if (score > bestScore) { input = pf.input; bestScore = score; }
          continue;
        }

        // Word overlap — require majority match in BOTH directions to prevent
        // "Recipient Tin" matching "Recipient's Address" via shared "recipient"
        const pfWords = npf.split(/\s+/).filter((w) => w.length > 1).map(stem);
        const matchCount = fnWords.filter((w) => pfWords.includes(w)).length;
        const minWords = Math.max(2, Math.ceil(fnWords.length * 0.6));
        if (matchCount >= minWords && matchCount / pfWords.length >= 0.5) {
          const score = matchCount / fnWords.length - (pfWords.length - matchCount) * 0.05;
          if (score > bestScore) { input = pf.input; bestScore = score; }
        }
      }
    }

    // 2. Fallback: static FIELD_MAPPINGS lookup by line ID
    if (!input && !usedInputs.has(staticMap.get(field.line))) {
      input = staticMap.get(field.line) ?? null;
    }

    if (!input) {
      console.log("[MBK] ✗ No match for:", field.field_name, "(line:", field.line + ")");
      continue;
    }

    let value = typeof field.value === "number"
      ? field.value.toFixed(2)
      : String(field.value);

    // Convert date formats: detect date values and reformat to mm/dd/yyyy
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDate) {
      value = `${isoDate[2]}/${isoDate[3]}/${isoDate[1]}`;
    }
    // Also handle dd/mm/yyyy or other slash formats — check if the page hint says mm/dd/yyyy
    const pageHint = input.closest(".form-group, div")?.textContent ?? "";
    if (/mm\/dd\/yyyy/i.test(pageHint) && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
      // Value is already in slash format, trust it as mm/dd/yyyy
    }

    // Skip non-numeric values for numeric inputs (prevents "short" going into dollar fields)
    if (input.type === "number" || input.inputMode === "decimal" || input.inputMode === "numeric") {
      if (!/^-?\d*\.?\d*$/.test(value.replace(/,/g, ""))) {
        console.log("[MBK] ✗ Skipped non-numeric value for numeric input:", field.field_name, "=", value);
        continue;
      }
    }

    console.log("[MBK] ✓ Matched:", field.field_name, "→", input.id || input.name, "=", value.substring(0, 20));
    autoFillField(input, value);
    usedInputs.add(input);
    filledCount++;
  }

  // Scroll the first filled field into view so the user sees the changes
  const firstFilled = document.querySelector(".mbk-filled");
  if (firstFilled) {
    firstFilled.classList.add("mbk-filled-first");
    firstFilled.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return { success: true, filledCount };
}

/**
 * Upload a file to the page's file input.
 * @param {{ dataUrl: string; fileName: string; mimeType: string }} data
 * @returns {{ success: boolean; error?: string }}
 */
function handleUploadFile(data) {
  // Find a file input on the page
  const fileInput = /** @type {HTMLInputElement | null} */ (
    document.querySelector('input[type="file"]')
  );

  if (!fileInput) {
    return { success: false, error: "No file upload input found on this page." };
  }

  try {
    // Convert data URL to File
    const [header, base64] = data.dataUrl.split(",");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], data.fileName, { type: data.mimeType });

    // Set the file on the input
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    console.log("[MBK] ✓ Uploaded file:", data.fileName, "to", fileInput.id || fileInput.name || "file input");
    return { success: true };
  } catch (e) {
    return { success: false, error: `Upload failed: ${e.message}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "autoFill") {
    const result = handleAutoFill(message);
    sendResponse(result);
    return true;
  }
  if (message.action === "detectPage") {
    sendResponse({ form: detectForm(), year: detectTaxYear() });
    return true;
  }
  if (message.action === "uploadFile") {
    const result = handleUploadFile(message);
    sendResponse(result);
    return true;
  }
  return false;
});
