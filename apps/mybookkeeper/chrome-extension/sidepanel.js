/** @typedef {{ id: string; tax_year: number; [key: string]: unknown }} TaxReturn */
/** @typedef {{ field_name: string; line: string; value: string | number }} FormField */

const $ = (/** @type {string} */ sel) => document.querySelector(sel);
const show = (/** @type {Element} */ el) => el.classList.remove("hidden");
const hide = (/** @type {Element} */ el) => el.classList.add("hidden");

const loginSection = /** @type {HTMLElement} */ ($("#login-section"));
const loginForm = /** @type {HTMLFormElement} */ ($("#login-form"));
const loginBtn = /** @type {HTMLButtonElement} */ ($("#login-btn"));
const loginError = /** @type {HTMLElement} */ ($("#login-error"));
const emailInput = /** @type {HTMLInputElement} */ ($("#email"));
const passwordInput = /** @type {HTMLInputElement} */ ($("#password"));
const totpGroup = /** @type {HTMLElement} */ ($("#totp-group"));
const totpInput = /** @type {HTMLInputElement} */ ($("#totp-code"));
const mainSection = /** @type {HTMLElement} */ ($("#main-section"));
const logoutBtn = /** @type {HTMLButtonElement} */ ($("#logout-btn"));
const statusIndicator = /** @type {HTMLElement} */ ($("#status-indicator"));
const statusText = /** @type {HTMLElement} */ ($("#status-text"));
const taxYearSelect = /** @type {HTMLSelectElement} */ ($("#tax-year-select"));
const infoBanner = /** @type {HTMLElement} */ ($("#info-banner"));
const formSelect = /** @type {HTMLSelectElement} */ ($("#form-select"));
const instanceGroup = /** @type {HTMLElement} */ ($("#instance-group"));
const instanceSelect = /** @type {HTMLSelectElement} */ ($("#instance-select"));
const viewDocBtn = /** @type {HTMLButtonElement} */ ($("#view-doc-btn"));
const detectedFormBar = /** @type {HTMLElement} */ ($("#detected-form-bar"));
const detectedFormText = /** @type {HTMLElement} */ ($("#detected-form-text"));
const fieldsContainer = /** @type {HTMLElement} */ ($("#fields-container"));
const fieldsList = /** @type {HTMLElement} */ ($("#fields-list"));
const autofillBtn = /** @type {HTMLButtonElement} */ ($("#autofill-btn"));
const uploadBtn = /** @type {HTMLButtonElement} */ ($("#upload-btn"));
const recomputeBtn = /** @type {HTMLButtonElement} */ ($("#recompute-btn"));
const mainError = /** @type {HTMLElement} */ ($("#main-error"));
const mainSuccess = /** @type {HTMLElement} */ ($("#main-success"));

/** @type {TaxReturn[]} */
let taxReturns = [];
/** @typedef {{ id: string; label: string; fields: FormField[] }} FieldGroup */
/** @type {FormField[]} */
let currentFields = [];
/** @type {FieldGroup[]} */
let allInstances = [];
/** Currently detected form from the page content script */
let detectedForm = /** @type {string | null} */ (null);
/** Currently selected instance's document ID */
let selectedDocumentId = /** @type {string | null} */ (null);
/** Whether the login form is in the TOTP step */
let awaitingTotp = false;

const FORM_OPTIONS = [
  { value: "w2", label: "W-2" },
  { value: "1099_misc", label: "1099-MISC" },
  { value: "1099_nec", label: "1099-NEC" },
  { value: "1099_int", label: "1099-INT" },
  { value: "1099_div", label: "1099-DIV" },
  { value: "1099_b", label: "1099-B" },
  { value: "1099_k", label: "1099-K" },
  { value: "1099_r", label: "1099-R" },
  { value: "1098", label: "1098" },
  { value: "1040", label: "Form 1040" },
  { value: "schedule_1", label: "Schedule 1" },
  { value: "schedule_b", label: "Schedule B (Interest & Dividends)" },
  { value: "schedule_c", label: "Schedule C (Business)" },
  { value: "schedule_e", label: "Schedule E (Rental Income)" },
];

// --- Initialization ---

document.addEventListener("DOMContentLoaded", init);

// DEV_AUTO_LOGIN: set to { email, password } to skip login screen during development.
// MUST be null before publishing — never commit real credentials.
const DEV_AUTO_LOGIN = null;

async function init() {
  const session = await chrome.storage.session.get(["token", "email"]);

  if (session.token) {
    showMainSection();
    await loadTaxReturns();
  } else if (DEV_AUTO_LOGIN) {
    const result = await chrome.runtime.sendMessage({
      action: "login",
      email: DEV_AUTO_LOGIN.email,
      password: DEV_AUTO_LOGIN.password,
      totpCode: null,
    });
    if (result.success) {
      showMainSection();
      await loadTaxReturns();
    } else {
      console.error("[MBK] Auto-login failed:", result.error);
      showLoginSection();
    }
  } else {
    showLoginSection();
  }

  bindEvents();
}

function bindEvents() {
  loginForm.addEventListener("submit", handleLogin);
  logoutBtn.addEventListener("click", handleLogout);
  taxYearSelect.addEventListener("change", handleTaxYearChange);
  formSelect.addEventListener("change", handleFormSelect);
  instanceSelect.addEventListener("change", handleInstanceSelect);
  autofillBtn.addEventListener("click", handleAutoFill);
  uploadBtn.addEventListener("click", handleUpload);
  viewDocBtn.addEventListener("click", handleViewDoc);
  recomputeBtn.addEventListener("click", handleRecompute);

  // Listen for page detection from content script (form + year)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "pageDetected") {
      onPageDetected(message.form, message.year);
    }
  });
}

// --- Auth ---

function showLoginSection() {
  show(loginSection);
  hide(mainSection);
}

function showMainSection() {
  hide(loginSection);
  show(mainSection);
}

/** @param {Event} e */
async function handleLogin(e) {
  e.preventDefault();
  hide(loginError);

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setButtonLoading(loginBtn, true);

  const totpCode = awaitingTotp ? (totpInput.value.trim() || null) : null;

  const result = await chrome.runtime.sendMessage({
    action: "login",
    email,
    password,
    totpCode,
  });

  setButtonLoading(loginBtn, false);

  if (!result.success) {
    if (result.error === "TOTP_REQUIRED") {
      awaitingTotp = true;
      show(totpGroup);
      totpInput.focus();
      return;
    }
    showError(result.error, loginError);
    return;
  }

  // Reset TOTP state on successful login
  awaitingTotp = false;
  hide(totpGroup);
  totpInput.value = "";
  passwordInput.value = "";
  showMainSection();

  if (result.warning) {
    showError(result.warning, mainError);
  }

  await loadTaxReturns();
}

async function handleLogout() {
  await chrome.runtime.sendMessage({ action: "logout" });
  taxReturns = [];
  currentFields = [];
  allInstances = [];
  detectedForm = null;
  awaitingTotp = false;
  hide(totpGroup);
  totpInput.value = "";
  taxYearSelect.innerHTML = '<option value="">Select tax year...</option>';
  formSelect.innerHTML = '<option value="">Select form...</option>';
  formSelect.disabled = true;
  hide(instanceGroup);
  show(infoBanner);
  detectedFormBar.classList.remove("detected");
  detectedFormText.textContent = "Navigate to a tax form page";
  hide(fieldsContainer);
  showLoginSection();
}

// --- Tax Returns ---

async function loadTaxReturns() {
  const result = await chrome.runtime.sendMessage({ action: "listTaxReturns" });

  if (!result.success) {
    if (result.code === "SESSION_EXPIRED") {
      showLoginSection();
    }
    setConnected(false);
    showError(result.error, mainError);
    return;
  }

  setConnected(true);
  taxReturns = Array.isArray(result.data) ? result.data : [];

  taxYearSelect.innerHTML = '<option value="">Select tax year...</option>';

  const years = [...new Set(taxReturns.map((r) => r.tax_year))].sort(
    (a, b) => b - a
  );

  for (const year of years) {
    const opt = document.createElement("option");
    opt.value = String(year);
    opt.textContent = String(year);
    taxYearSelect.appendChild(opt);
  }

  // Auto-select the most recent year; page detection may override
  if (years.length > 0) {
    taxYearSelect.value = String(years[0]);
  }

  recomputeBtn.disabled = !taxYearSelect.value;
  populateFormSelect();
  requestPageDetection();
}

function handleTaxYearChange() {
  const year = parseInt(taxYearSelect.value, 10);
  hide(fieldsContainer);
  clearMessages();

  if (!year) {
    recomputeBtn.disabled = true;
    formSelect.innerHTML = '<option value="">Select form...</option>';
    formSelect.disabled = true;
    return;
  }

  recomputeBtn.disabled = false;
  populateFormSelect();

  if (detectedForm) {
    formSelect.value = detectedForm;
    loadFormFields();
  }
}

async function populateFormSelect() {
  formSelect.innerHTML = '<option value="">Select form...</option>';
  formSelect.disabled = true;

  const year = parseInt(taxYearSelect.value, 10);
  if (!year) return;

  const taxReturn = taxReturns.find((r) => r.tax_year === year);
  if (!taxReturn) return;

  const result = await chrome.runtime.sendMessage({
    action: "getFormsOverview",
    returnId: taxReturn.id,
  });

  if (!result.success || !Array.isArray(result.data)) return;

  for (const item of result.data) {
    const known = FORM_OPTIONS.find((f) => f.value === item.form_name);
    const label = known?.label ?? item.form_name.replace(/_/g, " ").toUpperCase();
    const opt = document.createElement("option");
    opt.value = item.form_name;
    opt.textContent = `${label} (${item.instance_count})`;
    formSelect.appendChild(opt);
  }
  formSelect.disabled = false;
}

function handleFormSelect() {
  const form = formSelect.value;
  clearMessages();
  hide(instanceGroup);
  hide(fieldsContainer);

  if (!form) return;

  detectedForm = form;
  loadFormFields();
}

function handleInstanceSelect() {
  const id = instanceSelect.value;
  clearMessages();

  if (!id) {
    hide(fieldsContainer);
    selectedDocumentId = null;
    hide(viewDocBtn);
    return;
  }

  const inst = allInstances.find((i) => i.id === id);
  currentFields = inst ? inst.fields : [];
  selectedDocumentId = inst?.documentId ?? null;
  selectedDocumentId ? show(viewDocBtn) : hide(viewDocBtn);
  renderFields();
}

async function requestPageDetection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "detectPage" });
    onPageDetected(response?.form ?? null, response?.year ?? null);
  } catch {
    // Content script not injected (not on a tax site)
    onPageDetected(null, null);
  }
}

/**
 * @param {string | null} form
 * @param {number | null} year
 */
async function onPageDetected(form, year) {
  // Auto-select year if detected and available
  if (year) {
    const yearStr = String(year);
    const available = [...taxYearSelect.options].some((o) => o.value === yearStr);
    if (available) {
      taxYearSelect.value = yearStr;
      recomputeBtn.disabled = false;
    }
  }

  detectedForm = form;

  if (!form) {
    show(infoBanner);
    detectedFormBar.classList.remove("detected");
    detectedFormText.textContent = "Navigate to a tax form page";
    hide(fieldsContainer);
    return;
  }

  hide(infoBanner);
  const label = FORM_OPTIONS.find((f) => f.value === form)?.label ?? form;
  detectedFormBar.classList.add("detected");
  detectedFormText.textContent = label;

  // Sync dropdown to detected form
  if (formSelect.querySelector(`option[value="${form}"]`)) {
    formSelect.value = form;
  }

  await loadFormFields();
}

async function loadFormFields() {
  const year = parseInt(taxYearSelect.value, 10);
  if (!year || !detectedForm) return;

  const taxReturn = taxReturns.find((r) => r.tax_year === year);
  if (!taxReturn) return;

  clearMessages();

  const result = await chrome.runtime.sendMessage({
    action: "getFormFields",
    returnId: taxReturn.id,
    formName: detectedForm,
  });

  if (!result.success) {
    showError(result.error, mainError);
    return;
  }

  const instances = result.data?.instances ?? [];
  allInstances = instances.map((inst) => {
    const issuer = inst.instance_label || inst.issuer_name || null;
    const rawFields = inst.fields ?? [];
    const fields = rawFields
      .filter((f) => f.value !== "[REDACTED]" && f.value !== "***")
      .map((f) => ({
        field_name: f.label ?? f.field_id,
        line: f.field_id,
        value: f.value,
      }));
    // Add issuer/payer name as a field so it can be copied and auto-filled
    if (issuer) {
      fields.unshift({ field_name: "Payer / Financial Institution", line: "payer_name", value: issuer });
    }
    // Build a distinguishing label — add address or account number if name isn't unique
    const address = rawFields.find((f) => f.field_id === "box_8")?.value;
    const account = rawFields.find((f) => f.field_id === "account_number")?.value;
    let label = issuer || "Unknown";
    if (address && typeof address === "string") {
      label += ` — ${address}`;
    } else if (account) {
      label += ` — Acct ${String(account).slice(-6)}`;
    }
    return { id: inst.instance_id, documentId: inst.document_id, label, fields };
  }).filter((g) => g.fields.length > 0);

  if (allInstances.length === 0) {
    hide(instanceGroup);
    currentFields = [];
    selectedDocumentId = null;
    renderFields();
  } else if (allInstances.length === 1) {
    // Single instance — show the instance group with View button but no dropdown needed
    instanceSelect.innerHTML = '';
    const opt = document.createElement("option");
    opt.value = allInstances[0].id;
    opt.textContent = allInstances[0].label;
    instanceSelect.appendChild(opt);
    show(instanceGroup);
    currentFields = allInstances[0].fields;
    selectedDocumentId = allInstances[0].documentId;
    selectedDocumentId ? show(viewDocBtn) : hide(viewDocBtn);
    renderFields();
  } else {
    // Multiple instances — show the picker
    instanceSelect.innerHTML = '<option value="">Select document...</option>';
    for (const inst of allInstances) {
      const opt = document.createElement("option");
      opt.value = inst.id;
      opt.textContent = inst.label;
      instanceSelect.appendChild(opt);
    }
    show(instanceGroup);
    currentFields = [];
    hide(fieldsContainer);
  }
}

function renderFields() {
  fieldsList.innerHTML = "";

  if (currentFields.length === 0) {
    fieldsList.innerHTML =
      '<div class="field-row"><span class="field-name">No data available for this form.</span></div>';
    show(fieldsContainer);
    autofillBtn.disabled = true;
    return;
  }

  for (const field of currentFields) {
    const row = document.createElement("div");
    row.className = "field-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "field-name";
    nameSpan.textContent = field.field_name;

    const valueSpan = document.createElement("span");
    valueSpan.className = "field-value";
    valueSpan.textContent = formatValue(field.value, field.line);

    const copyBtn = document.createElement("button");
    copyBtn.className = "field-copy";
    copyBtn.title = "Copy value";
    copyBtn.innerHTML = "&#x1F4CB;";
    const rawValue = typeof field.value === "number" ? field.value.toFixed(2) : String(field.value);
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(rawValue).then(() => {
        copyBtn.textContent = "\u2713";
        setTimeout(() => { copyBtn.innerHTML = "&#x1F4CB;"; }, 1000);
      });
    });

    row.appendChild(nameSpan);
    row.appendChild(valueSpan);
    row.appendChild(copyBtn);
    fieldsList.appendChild(row);
  }

  show(fieldsContainer);
  autofillBtn.disabled = false;
  uploadBtn.disabled = !selectedDocumentId;
}

const PII_FIELDS = new Set([
  "recipient_tin", "payer_tin", "ssn", "account_number", "recipient_ssn",
]);
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Format value for display — masks PII fields, shows everything else.
 * The unmasked values in currentFields are still used for auto-fill.
 * @param {string | number | boolean} value
 * @param {string} [fieldId]
 */
function formatValue(value, fieldId) {
  if (typeof value === "number") {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  let str = String(value);
  if (fieldId && PII_FIELDS.has(fieldId)) {
    return str.length >= 4 ? "***" + str.slice(-4) : "****";
  }
  return str.replace(SSN_RE, (m) => "***-**-" + m.slice(-4));
}

// --- Auto-Fill ---

async function handleAutoFill() {
  if (currentFields.length === 0) return;
  clearMessages();
  setButtonLoading(autofillBtn, true);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    showError("No active tab found.", mainError);
    setButtonLoading(autofillBtn, false);
    return;
  }

  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, {
        action: "autoFill",
        fields: currentFields,
        formName: detectedForm,
      });
    } catch {
      // Content script not injected yet — inject it and retry
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"],
      });
      response = await chrome.tabs.sendMessage(tab.id, {
        action: "autoFill",
        fields: currentFields,
        formName: detectedForm,
      });
    }

    setButtonLoading(autofillBtn, false);

    if (response?.success) {
      const count = response.filledCount ?? 0;
      showSuccess(
        count > 0
          ? `Filled ${count} field${count === 1 ? "" : "s"} on the page.`
          : "No matching fields on this page. Try navigating to the page with the actual form values."
      );
    } else {
      showError(response?.error ?? "Auto-fill failed.", mainError);
    }
  } catch {
    setButtonLoading(autofillBtn, false);
    showError(
      "Could not reach the page. Make sure you are on a supported tax filing site.",
      mainError
    );
  }
}

// --- View Document ---

async function handleViewDoc() {
  if (!selectedDocumentId) return;
  clearMessages();

  const result = await chrome.runtime.sendMessage({
    action: "downloadDocument",
    documentId: selectedDocumentId,
  });

  if (!result.success) {
    showError(result.error, mainError);
    return;
  }

  // Open the file in a new tab
  const [header] = result.data.dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] ?? result.data.mimeType;
  const binary = atob(result.data.dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  chrome.tabs.create({ url });
}

// --- Upload Source Doc ---

async function handleUpload() {
  if (!selectedDocumentId) return;
  clearMessages();
  setButtonLoading(uploadBtn, true);

  // 1. Download the file from MyBookkeeper
  const dlResult = await chrome.runtime.sendMessage({
    action: "downloadDocument",
    documentId: selectedDocumentId,
  });

  if (!dlResult.success) {
    setButtonLoading(uploadBtn, false);
    showError(dlResult.error, mainError);
    return;
  }

  // 2. Send it to the content script to upload into the page's file input
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setButtonLoading(uploadBtn, false);
    showError("No active tab found.", mainError);
    return;
  }

  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, {
        action: "uploadFile",
        dataUrl: dlResult.data.dataUrl,
        fileName: dlResult.data.fileName,
        mimeType: dlResult.data.mimeType,
      });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      response = await chrome.tabs.sendMessage(tab.id, {
        action: "uploadFile",
        dataUrl: dlResult.data.dataUrl,
        fileName: dlResult.data.fileName,
        mimeType: dlResult.data.mimeType,
      });
    }

    setButtonLoading(uploadBtn, false);

    if (response?.success) {
      showSuccess("Source document uploaded to the page.");
    } else {
      showError(response?.error ?? "Upload failed.", mainError);
    }
  } catch {
    setButtonLoading(uploadBtn, false);
    showError("Could not reach the page. Make sure you are on a supported tax filing site.", mainError);
  }
}

// --- Recompute ---

async function handleRecompute() {
  const year = parseInt(taxYearSelect.value, 10);
  if (!year) return;

  const taxReturn = taxReturns.find((r) => r.tax_year === year);
  if (!taxReturn) return;

  clearMessages();
  setButtonLoading(recomputeBtn, true);

  const result = await chrome.runtime.sendMessage({
    action: "recompute",
    returnId: taxReturn.id,
  });

  setButtonLoading(recomputeBtn, false);

  if (!result.success) {
    showError(result.error, mainError);
    return;
  }

  showSuccess("Values recomputed. Refreshing fields...");

  if (detectedForm) {
    await loadFormFields();
  }
}

// --- UI Helpers ---

/**
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 */
function setButtonLoading(btn, loading) {
  const textSpan = btn.querySelector(".btn-text");
  const loadingSpan = btn.querySelector(".btn-loading");
  if (!textSpan || !loadingSpan) return;

  btn.disabled = loading;
  if (loading) {
    hide(textSpan);
    show(loadingSpan);
  } else {
    show(textSpan);
    hide(loadingSpan);
  }
}

/**
 * @param {boolean} connected
 */
function setConnected(connected) {
  statusIndicator.className = `status ${connected ? "connected" : "disconnected"}`;
  statusText.textContent = connected ? "Connected" : "Disconnected";
}

/**
 * @param {string} msg
 * @param {HTMLElement} [target]
 */
function showError(msg, target) {
  const el = target ?? mainError;
  el.textContent = msg;
  show(el);
  setTimeout(() => hide(el), 8000);
}

/** @param {string} msg */
function showSuccess(msg) {
  mainSuccess.textContent = msg;
  show(mainSuccess);
  setTimeout(() => hide(mainSuccess), 4000);
}

function clearMessages() {
  hide(loginError);
  hide(mainError);
  hide(mainSuccess);
}
