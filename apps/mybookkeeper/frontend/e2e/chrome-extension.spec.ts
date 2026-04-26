import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { BACKEND_URL, E2E_EMAIL, E2E_PASSWORD } from "./fixtures/config";

// Use base test without auth fixture — extension tests load local files
const test = base;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PAGES_DIR = path.resolve(__dirname, "../../chrome-extension/test-pages");
const CONTENT_JS = path.resolve(__dirname, "../../chrome-extension/content.js");
const SIDEPANEL_HTML = path.resolve(__dirname, "../../chrome-extension/sidepanel.html");

// Strip the chrome.runtime.onMessage listener since we're not in an extension context
function getContentScript(): string {
  const raw = fs.readFileSync(CONTENT_JS, "utf-8");
  return raw.replace(/chrome\.runtime\.onMessage[\s\S]*$/, "");
}

const CONTENT_SCRIPT = getContentScript();

interface AutoFillResult {
  success: boolean;
  filledCount: number;
}

// Schedule E test data (rental property)
const SCHEDULE_E_FIELDS = [
  { field_name: "Rents received", line: "line_3", value: 24000 },
  { field_name: "Advertising", line: "line_5", value: 350 },
  { field_name: "Cleaning and maintenance", line: "line_7", value: 1200 },
  { field_name: "Insurance", line: "line_9", value: 2400 },
  { field_name: "Mortgage interest", line: "line_12", value: 8500 },
  { field_name: "Repairs", line: "line_14", value: 750 },
  { field_name: "Taxes", line: "line_16", value: 3200 },
  { field_name: "Utilities", line: "line_17", value: 1800 },
  { field_name: "Depreciation", line: "line_18", value: 5000 },
];

// W-2 test data
const W2_FIELDS = [
  { field_name: "Wages, tips", line: "box_1", value: 75000 },
  { field_name: "Federal income tax withheld", line: "box_2", value: 12500 },
  { field_name: "Social security wages", line: "box_3", value: 75000 },
  { field_name: "Social security tax", line: "box_4", value: 4650 },
  { field_name: "Medicare wages", line: "box_5", value: 75000 },
  { field_name: "Medicare tax", line: "box_6", value: 1087.5 },
];

// Schedule C test data
const SCHEDULE_C_FIELDS = [
  { field_name: "Gross receipts", line: "line_1", value: 85000 },
  { field_name: "Car and truck expenses", line: "line_9", value: 4200 },
  { field_name: "Contract labor", line: "line_11", value: 12000 },
  { field_name: "Office expense", line: "line_18", value: 1500 },
  { field_name: "Supplies", line: "line_22", value: 800 },
  { field_name: "Meals", line: "line_24b", value: 2400 },
];

async function loadTestPage(page: Page, filename: string): Promise<void> {
  const filePath = path.join(TEST_PAGES_DIR, filename);
  await page.goto(`file:///${filePath.replace(/\\/g, "/")}`);
  await page.waitForLoadState("domcontentloaded");
}

async function injectAndBuildMap(page: Page): Promise<Record<string, string>> {
  // Inject the stripped content script (no chrome.runtime references) as a <script> tag
  await page.addScriptTag({ content: CONTENT_SCRIPT });

  return page.evaluate(() => {
    // @ts-expect-error -- buildPageFieldMap defined by injected script
    const fieldMap = buildPageFieldMap() as Map<string, HTMLInputElement>;
    const result: Record<string, string> = {};
    for (const [lineId, input] of fieldMap.entries()) {
      if (input.id) result[lineId] = `#${input.id}`;
      else if (input.name) result[lineId] = `[name="${input.name}"]`;
    }
    return result;
  });
}

async function autoFill(
  page: Page,
  fields: Array<{ field_name: string; line: string; value: number | string }>,
  formName: string,
): Promise<AutoFillResult> {
  await page.addScriptTag({ content: CONTENT_SCRIPT });

  // Use the content script's handleAutoFill directly — it handles disambiguation
  // and uses the native value setter. Then verify values via Playwright locators.
  return page.evaluate(
    (data) => {
      // @ts-expect-error -- handleAutoFill is injected via script tag
      return handleAutoFill(data);
    },
    { fields, formName },
  );
}

// Mock chrome APIs for sidepanel tests
function getChromeApiMock(serverUrl: string): string {
  return `
    window._mockMessages = [];
    window._mockStorage = { local: { serverUrl: "${serverUrl}" }, session: {} };

    window.chrome = {
      storage: {
        local: {
          get: async (keys) => {
            const result = {};
            for (const k of (Array.isArray(keys) ? keys : [keys])) {
              if (window._mockStorage.local[k] !== undefined) result[k] = window._mockStorage.local[k];
            }
            return result;
          },
          set: async (obj) => { Object.assign(window._mockStorage.local, obj); },
        },
        session: {
          get: async (keys) => {
            const result = {};
            for (const k of (Array.isArray(keys) ? keys : [keys])) {
              if (window._mockStorage.session[k] !== undefined) result[k] = window._mockStorage.session[k];
            }
            return result;
          },
          set: async (obj) => { Object.assign(window._mockStorage.session, obj); },
          remove: async (keys) => {
            for (const k of (Array.isArray(keys) ? keys : [keys])) delete window._mockStorage.session[k];
          },
        },
      },
      runtime: {
        sendMessage: async (msg) => {
          window._mockMessages.push(msg);
          const serverUrl = window._mockStorage.local.serverUrl;
          const token = window._mockStorage.session.token;
          const orgId = window._mockStorage.session.orgId;

          if (msg.action === "login") {
            try {
              const res = await fetch(msg.serverUrl + "/auth/totp/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: msg.email, password: msg.password, totp_code: null }),
              });
              if (!res.ok) return { success: false, error: "Invalid credentials" };
              const data = await res.json();
              if (data.detail === "totp_required") return { success: false, error: "TOTP required" };
              window._mockStorage.session.token = data.access_token;
              window._mockStorage.session.email = msg.email;
              // Fetch org
              const orgRes = await fetch(msg.serverUrl + "/organizations", {
                headers: { Authorization: "Bearer " + data.access_token },
              });
              if (orgRes.ok) {
                const orgs = await orgRes.json();
                if (orgs.length > 0) window._mockStorage.session.orgId = orgs[0].id;
              }
              return { success: true };
            } catch (e) { return { success: false, error: String(e) }; }
          }

          if (msg.action === "logout") {
            delete window._mockStorage.session.token;
            delete window._mockStorage.session.email;
            delete window._mockStorage.session.orgId;
            return { success: true };
          }

          if (msg.action === "listTaxReturns") {
            if (!token) return { success: false, error: "Not logged in", code: "SESSION_EXPIRED" };
            try {
              const headers = { Authorization: "Bearer " + token };
              if (orgId) headers["X-Organization-Id"] = orgId;
              const res = await fetch(serverUrl + "/tax-returns", { headers });
              if (!res.ok) return { success: false, error: "Failed to load tax returns" };
              return { success: true, data: await res.json() };
            } catch (e) { return { success: false, error: String(e) }; }
          }

          if (msg.action === "getFormFields") {
            if (!token) return { success: false, error: "Not logged in" };
            try {
              const headers = { Authorization: "Bearer " + token };
              if (orgId) headers["X-Organization-Id"] = orgId;
              const res = await fetch(serverUrl + "/tax-returns/" + msg.returnId + "/forms/" + msg.formName, { headers });
              if (!res.ok) return { success: false, error: "Failed to load form fields" };
              const data = await res.json();
              const fields = (data.fields || []).map(f => ({
                field_name: f.field_label || f.field_id,
                line: f.field_id,
                value: f.value_numeric ?? f.value_text ?? "",
              }));
              return { success: true, data: fields };
            } catch (e) { return { success: false, error: String(e) }; }
          }

          if (msg.action === "recompute") {
            if (!token) return { success: false, error: "Not logged in" };
            try {
              const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
              if (orgId) headers["X-Organization-Id"] = orgId;
              const res = await fetch(serverUrl + "/tax-returns/" + msg.returnId + "/recompute", { method: "POST", headers });
              if (!res.ok) return { success: false, error: "Recompute failed" };
              return { success: true };
            } catch (e) { return { success: false, error: String(e) }; }
          }

          return { success: false, error: "Unknown action" };
        },
        onMessage: { addListener: () => {} },
      },
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (_tabId, msg) => {
          // Simulate content script auto-fill in the same page
          return { success: true, filledCount: (msg.fields || []).length };
        },
      },
      sidePanel: { setOptions: async () => {} },
    };
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// PART 1: Auto-fill logic — inject content.js into test pages
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Chrome Extension — FreeTaxUSA auto-fill", () => {
  test.beforeEach(async ({ page }) => {
    await loadTestPage(page, "freetaxusa.html");

  });

  test("fills W-2 fields correctly", async ({ page }) => {
    const result = await autoFill(page, W2_FIELDS, "w2");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#w2_box1")).toHaveValue("75000.00");
    await expect(page.locator("#w2_box2")).toHaveValue("12500.00");
    await expect(page.locator("#w2_box3")).toHaveValue("75000.00");
  });

  test("fills Schedule E fields correctly", async ({ page }) => {
    const result = await autoFill(page, SCHEDULE_E_FIELDS, "schedule_e");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(5);
    await expect(page.locator("#sched_e_line3")).toHaveValue("24000.00");
    await expect(page.locator("#sched_e_line7")).toHaveValue("1200.00");
    await expect(page.locator("#sched_e_line12")).toHaveValue("8500.00");
  });

  test("fills Schedule C fields correctly", async ({ page }) => {
    const result = await autoFill(page, SCHEDULE_C_FIELDS, "schedule_c");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#sched_c_line1")).toHaveValue("85000.00");
    await expect(page.locator("#sched_c_line11")).toHaveValue("12000.00");
  });

  test("autoFillField function applies mbk-filled highlight class", async ({ page }) => {
    await page.addScriptTag({ content: CONTENT_SCRIPT });
    await page.evaluate(() => {
      const input = document.querySelector("#w2_box1") as HTMLInputElement;
      // @ts-expect-error -- autoFillField is injected via script tag
      autoFillField(input, "12345");
    });
    await expect(page.locator("#w2_box1")).toHaveClass(/mbk-filled/);
  });

  test("returns zero filledCount for empty field array", async ({ page }) => {
    const result = await autoFill(page, [], "w2");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(0);
  });
});

test.describe("Chrome Extension — TurboTax auto-fill", () => {
  test.beforeEach(async ({ page }) => {
    await loadTestPage(page, "turbotax.html");

  });

  test("fills W-2 fields via aria-label matching", async ({ page }) => {
    const result = await autoFill(page, W2_FIELDS, "w2");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(3);
    await expect(page.locator('[data-testid="w2-box1-wages"]')).toHaveValue("75000.00");
  });

  test("fills Schedule E fields via aria-label matching", async ({ page }) => {
    const result = await autoFill(page, SCHEDULE_E_FIELDS, "schedule_e");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(6);
    await expect(page.locator('[data-testid="sched-e-line3"]')).toHaveValue("24000.00");
  });
});

test.describe("Chrome Extension — H&R Block auto-fill", () => {
  test.beforeEach(async ({ page }) => {
    await loadTestPage(page, "hrblock.html");

  });

  test("fills W-2 fields via label-for matching", async ({ page }) => {
    const result = await autoFill(page, W2_FIELDS, "w2");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#input_w2_1")).toHaveValue("75000.00");
    await expect(page.locator("#input_w2_2")).toHaveValue("12500.00");
  });

  test("fills Schedule E fields", async ({ page }) => {
    const result = await autoFill(page, SCHEDULE_E_FIELDS, "schedule_e");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(6);
    await expect(page.locator("#input_se_3")).toHaveValue("24000.00");
  });
});

test.describe("Chrome Extension — TaxAct auto-fill", () => {
  test.beforeEach(async ({ page }) => {
    await loadTestPage(page, "taxact.html");

  });

  test("fills W-2 fields", async ({ page }) => {
    const result = await autoFill(page, W2_FIELDS, "w2");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#line_box1")).toHaveValue("75000.00");
  });

  test("fills Schedule E fields", async ({ page }) => {
    const result = await autoFill(page, SCHEDULE_E_FIELDS, "schedule_e");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(6);
    await expect(page.locator("#line_se_3")).toHaveValue("24000.00");
  });
});

test.describe("Chrome Extension — IRS DirectFile auto-fill", () => {
  test.beforeEach(async ({ page }) => {
    await loadTestPage(page, "irs-directfile.html");

  });

  test("fills W-2 fields via semantic IDs", async ({ page }) => {
    const result = await autoFill(page, W2_FIELDS, "w2");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#writableWages")).toHaveValue("75000.00");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 2: Cross-site consistency
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Chrome Extension — cross-site consistency", () => {
  const SITES = [
    { name: "FreeTaxUSA", file: "freetaxusa.html", wagesSelector: "#w2_box1" },
    { name: "TurboTax", file: "turbotax.html", wagesSelector: '[data-testid="w2-box1-wages"]' },
    { name: "H&R Block", file: "hrblock.html", wagesSelector: "#input_w2_1" },
    { name: "TaxAct", file: "taxact.html", wagesSelector: "#line_box1" },
    { name: "IRS DirectFile", file: "irs-directfile.html", wagesSelector: "#writableWages" },
  ];

  for (const site of SITES) {
    test(`${site.name} — W-2 wages auto-fills to correct value`, async ({ page }) => {
      await loadTestPage(page, site.file);
  
      await autoFill(page, W2_FIELDS, "w2");
      await expect(page.locator(site.wagesSelector)).toHaveValue("75000.00");
    });
  }

  test("numeric values format to 2 decimal places", async ({ page }) => {
    await loadTestPage(page, "freetaxusa.html");

    await autoFill(page, [{ field_name: "Wages, tips", line: "box_1", value: 1234 }], "w2");
    await expect(page.locator("#w2_box1")).toHaveValue("1234.00");
  });

  test("unrecognized line IDs are skipped without error", async ({ page }) => {
    await loadTestPage(page, "freetaxusa.html");

    const result = await autoFill(page, [
      { field_name: "Unknown", line: "line_999", value: 100 },
      { field_name: "Wages, tips", line: "box_1", value: 50000 },
    ], "w2");
    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(1);
    await expect(page.locator("#w2_box1")).toHaveValue("50000.00");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 3: Sidepanel UI — load HTML directly with mocked chrome APIs
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Chrome Extension — Sidepanel UI", () => {
  async function loadSidepanel(page: Page): Promise<void> {
    // Inject chrome API mocks before the page scripts run
    await page.addInitScript(getChromeApiMock(BACKEND_URL));
    await page.goto(`file:///${SIDEPANEL_HTML.replace(/\\/g, "/")}`);
    await page.waitForLoadState("domcontentloaded");
  }

  test("shows login section on first load", async ({ page }) => {
    await loadSidepanel(page);
    await expect(page.locator("#login-section")).toBeVisible();
    await expect(page.locator("#main-section")).not.toBeVisible();
  });

  test("server URL input is pre-populated from storage", async ({ page }) => {
    await loadSidepanel(page);
    await expect(page.locator("#server-url")).toHaveValue(BACKEND_URL);
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await loadSidepanel(page);
    await page.locator("#email").fill("bad@example.com");
    await page.locator("#password").fill("wrongpassword");
    await page.locator("#login-btn").click();
    await expect(page.locator("#login-error")).toBeVisible({ timeout: 10000 });
  });

  test("login with valid credentials shows main section", async ({ page }) => {
    await loadSidepanel(page);

    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.locator("#login-btn").click();

    await expect(page.locator("#main-section")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#login-section")).not.toBeVisible();
    await expect(page.locator("#status-text")).toHaveText("Connected");
  });

  test("after login, tax year dropdown is populated", async ({ page }) => {
    await loadSidepanel(page);

    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.locator("#login-btn").click();
    await expect(page.locator("#main-section")).toBeVisible({ timeout: 15000 });

    // Tax year select should have at least the default option
    const options = page.locator("#tax-year-select option");
    await expect(options).not.toHaveCount(0, { timeout: 10000 });
  });

  test("selecting a tax year enables the form selector", async ({ page }) => {
    await loadSidepanel(page);

    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.locator("#login-btn").click();
    await expect(page.locator("#main-section")).toBeVisible({ timeout: 15000 });

    // Wait for tax years to load
    await page.waitForTimeout(1000);

    const yearSelect = page.locator("#tax-year-select");
    const yearOptions = await yearSelect.locator("option").allTextContents();

    // If there are tax returns, select the first real year
    if (yearOptions.length > 1) {
      await yearSelect.selectOption({ index: 1 });
      await expect(page.locator("#form-select")).toBeEnabled();
    }
  });

  test("logout returns to login section", async ({ page }) => {
    await loadSidepanel(page);

    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.locator("#login-btn").click();
    await expect(page.locator("#main-section")).toBeVisible({ timeout: 15000 });

    await page.locator("#logout-btn").click();
    await expect(page.locator("#login-section")).toBeVisible();
    await expect(page.locator("#main-section")).not.toBeVisible();
  });
});
