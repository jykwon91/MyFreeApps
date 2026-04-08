/** @typedef {{ success: boolean; data?: unknown; error?: string }} ApiResponse */

const API_URL = "https://165-245-134-251.sslip.io/api";

function getServerUrl() {
  return API_URL;
}

/**
 * @param {string} email
 * @param {string} password
 * @param {string | null} [totpCode]
 * @returns {Promise<ApiResponse>}
 */
async function login(email, password, totpCode = null) {
  const serverUrl = getServerUrl();
  const url = `${serverUrl}/auth/totp/login`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, totp_code: totpCode }),
  });

  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return { success: false, error: `Login failed (${res.status}): ${text}` };
  }

  const data = await res.json();

  // Handle TOTP challenge — user has 2FA enabled but didn't provide a code
  if (data.detail === "totp_required") {
    return { success: false, error: "TOTP_REQUIRED" };
  }

  const token = data.access_token;
  if (!token) {
    return { success: false, error: "No access token in response" };
  }

  // Fetch user's organizations to get org ID for scoped API calls
  let orgId = null;
  let orgWarning = null;
  try {
    const orgRes = await fetch(`${serverUrl}/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (orgRes.ok) {
      const orgs = await orgRes.json();
      if (orgs.length > 0) {
        orgId = orgs[0].id;
      }
    } else {
      orgWarning = `Could not load organizations (${orgRes.status}). Some features may not work.`;
    }
  } catch {
    orgWarning = "Could not load organizations. Some features may not work.";
  }

  await chrome.storage.session.set({ token, email, orgId });

  if (orgWarning) {
    return { success: true, warning: orgWarning };
  }
  return { success: true };
}

/**
 * @param {string} token
 * @param {string} path
 * @param {{ method?: string; body?: unknown }} [options]
 * @returns {Promise<ApiResponse>}
 */
async function apiFetch(token, path, options = {}) {
  const url = `${getServerUrl()}${path}`;
  const method = options.method ?? "GET";

  const session = await chrome.storage.session.get(["orgId"]);
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${token}` };
  if (session.orgId) {
    headers["X-Organization-Id"] = session.orgId;
  }
  /** @type {RequestInit} */
  const fetchOpts = { method, headers };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOpts);

  if (res.status === 401) {
    await chrome.storage.session.remove(["token", "orgId"]);
    return { success: false, error: "Session expired. Please log in again.", code: "SESSION_EXPIRED" };
  }

  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return { success: false, error: `API error (${res.status}): ${text}` };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !contentType.includes("application/json")) {
    return { success: true, data: null };
  }

  const data = await res.json();
  return { success: true, data };
}

/**
 * @param {string} token
 * @returns {Promise<ApiResponse>}
 */
function listTaxReturns(token) {
  return apiFetch(token, "/tax-returns");
}

/**
 * @param {string} token
 * @param {string} returnId
 * @returns {Promise<ApiResponse>}
 */
function getFormsOverview(token, returnId) {
  return apiFetch(token, `/tax-returns/${returnId}/forms-overview`);
}

/**
 * @param {string} token
 * @param {string} returnId
 * @param {string} formName
 * @returns {Promise<ApiResponse>}
 */
function getFormFields(token, returnId, formName) {
  return apiFetch(
    token,
    `/tax-returns/${returnId}/forms/${encodeURIComponent(formName)}?mask=false`
  );
}

/**
 * @param {string} token
 * @param {string} returnId
 * @returns {Promise<ApiResponse>}
 */
function recompute(token, returnId) {
  return apiFetch(token, `/tax-returns/${returnId}/recompute`, {
    method: "POST",
  });
}

/**
 * Download a document's source file as a base64 data URL.
 * @param {string} token
 * @param {string} documentId
 * @returns {Promise<ApiResponse>}
 */
async function downloadDocument(token, documentId) {
  const url = `${getServerUrl()}/documents/${documentId}/download`;
  const session = await chrome.storage.session.get(["orgId"]);
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${token}` };
  if (session.orgId) {
    headers["X-Organization-Id"] = session.orgId;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    return { success: false, error: `Download failed (${res.status})` };
  }

  const blob = await res.blob();

  // Extract filename from Content-Disposition header
  const disposition = res.headers.get("content-disposition") ?? "";
  let fileName = disposition.match(/filename\*=UTF-8''([^;"\s]+)/i)?.[1]
    ?? disposition.match(/filename="?([^";\s]+)"?/i)?.[1]
    ?? null;
  if (fileName) fileName = decodeURIComponent(fileName);

  // Ensure a proper filename with extension based on MIME type
  const MIME_EXT = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
  const ext = MIME_EXT[blob.type] ?? "";
  if (!fileName) {
    fileName = `document${ext}`;
  } else if (ext && !fileName.toLowerCase().endsWith(ext)) {
    fileName += ext;
  }

  // Convert to base64 data URL so we can pass it through messaging
  const reader = new FileReader();
  const dataUrl = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  return {
    success: true,
    data: { dataUrl, fileName, mimeType: blob.type },
  };
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

/**
 * @param {{ action: string; [key: string]: unknown }} message
 * @returns {Promise<ApiResponse>}
 */
async function handleMessage(message) {
  const { action } = message;

  if (action === "login") {
    return login(
      /** @type {string} */ (message.email),
      /** @type {string} */ (message.password),
      /** @type {string | null} */ (message.totpCode ?? null),
    );
  }

  const session = await chrome.storage.session.get(["token"]);
  const { token } = session;

  if (!token) {
    return { success: false, error: "Not authenticated", code: "SESSION_EXPIRED" };
  }

  switch (action) {
    case "listTaxReturns":
      return listTaxReturns(token);

    case "getFormsOverview":
      return getFormsOverview(token, /** @type {string} */ (message.returnId));

    case "getFormFields":
      return getFormFields(
        token,
        /** @type {string} */ (message.returnId),
        /** @type {string} */ (message.formName)
      );

    case "recompute":
      return recompute(token, /** @type {string} */ (message.returnId));

    case "downloadDocument":
      return downloadDocument(token, /** @type {string} */ (message.documentId));

    case "logout":
      await chrome.storage.session.remove(["token", "orgId"]);
      return { success: true };

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}
