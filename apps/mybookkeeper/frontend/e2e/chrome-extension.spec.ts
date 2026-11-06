import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { BACKEND_URL, E2E_EMAIL, E2E_PASSWORD } from "./fixtures/config";
import { test as authedTest } from "./fixtures/auth";

declare global {
  interface Window {
    /** Set by the side-panel runtime below; delivers a message as if the tab's content script sent it. */
    __mbkFromContentScript: (message: { action: string; form: string | null; year: number | null }) => void;
  }
}

// Most tests load local files and need no signed-in user; the side-panel tests
// that seed data use authedTest for its API client.
const test = base;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PAGES_DIR = path.resolve(__dirname, "../../chrome-extension/test-pages");
const CONTENT_JS = path.resolve(__dirname, "../../chrome-extension/content.js");
const SIDEPANEL_HTML = path.resolve(__dirname, "../../chrome-extension/sidepanel.html");
const BACKGROUND_JS = path.resolve(__dirname, "../../chrome-extension/background.js");

// Outside an extension `chrome.runtime` is missing (headed Chrome still defines
// `window.chrome`, just without `runtime`). content.js announces the detected
// page on load and registers a message listener, so stub both as no-ops and
// inject the file unmodified.
const CHROME_STUB =
  "window.chrome = Object.assign(window.chrome || {}, { runtime: { sendMessage: () => Promise.resolve(), onMessage: { addListener: () => {} } } });\n";

function getContentScript(): string {
  return CHROME_STUB + fs.readFileSync(CONTENT_JS, "utf-8");
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
  // Inject content.js (with the chrome stub) as a <script> tag
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

// Runs the real background.js inside the side-panel page. Messages the side
// panel sends reach background.js's onMessage listener, as they do in Chrome,
// and its fetch goes through Playwright (see loadSidepanel).
function getExtensionRuntime(apiUrl: string): string {
  const background = JSON.stringify(fs.readFileSync(BACKGROUND_JS, "utf-8"));
  return `
    function storageArea(initial) {
      const data = { ...initial };
      return {
        get: async (keys) => {
          if (keys === null || keys === undefined) return { ...data };
          if (typeof keys === "string" || Array.isArray(keys)) {
            const out = {};
            for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
            return out;
          }
          const out = { ...keys };
          for (const k of Object.keys(keys)) if (k in data) out[k] = data[k];
          return out;
        },
        set: async (obj) => { Object.assign(data, obj); },
        remove: async (keys) => { for (const k of [].concat(keys)) delete data[k]; },
      };
    }

    // The real worker fetches with host permissions, so CORS never applies; a
    // page loaded from file:// would be refused.
    async function backgroundFetch(url, init) {
      const res = await window.__mbkBackgroundFetch(String(url), init || {});
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        headers: { get: (name) => res.headers[name.toLowerCase()] ?? null },
        text: async () => res.body,
        json: async () => JSON.parse(res.body),
        blob: async () => { throw new Error("blob() is not supported by the test fetch bridge"); },
      };
    }

    const storage = {
      sync: storageArea({ apiUrl: ${JSON.stringify(apiUrl)} }),
      local: storageArea({}),
      session: storageArea({}),
    };
    const backgroundListeners = [];
    const pageListeners = [];
    // What the content script would send from the tab, e.g. pageDetected.
    window.__mbkFromContentScript = (message) => {
      for (const listener of pageListeners) listener(structuredClone(message), {}, () => {});
    };

    // A service worker has no window, document, localStorage or XHR; hide them
    // so background.js can't come to rely on them here.
    new Function("chrome", "fetch", "window", "document", "localStorage", "XMLHttpRequest", ${background})(
      {
        storage,
        action: { onClicked: { addListener: () => {} } },
        sidePanel: { open: async () => {} },
        runtime: { onMessage: { addListener: (fn) => backgroundListeners.push(fn) } },
      },
      backgroundFetch,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    window.chrome = {
      storage,
      runtime: {
        // Chrome copies messages both ways and rejects when nothing listens.
        sendMessage: (message) => new Promise((resolve, reject) => {
          if (backgroundListeners.length === 0) {
            reject(new Error("Could not establish connection. Receiving end does not exist."));
            return;
          }
          const respond = (response) => resolve(structuredClone(response));
          for (const listener of backgroundListeners) {
            if (listener(structuredClone(message), {}, respond) === true) return;
          }
          resolve(undefined);
        }),
        onMessage: { addListener: (fn) => pageListeners.push(fn) },
      },
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (_tabId, msg) => ({ success: true, filledCount: (msg.fields || []).length }),
      },
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
  // `slow` holds back replies to matching URLs; `delivered` counts them as they arrive.
  interface SlowReplies {
    slow: (url: string) => boolean;
    delayMs: number;
    delivered: number;
  }

  async function loadSidepanel(page: Page, slowReplies?: SlowReplies): Promise<void> {
    await page.exposeFunction(
      "__mbkBackgroundFetch",
      async (
        url: string,
        init: { method?: string; headers?: Record<string, string>; body?: string },
      ): Promise<{ status: number; headers: Record<string, string>; body: string }> => {
        const res = await fetch(url, init);
        const reply = { status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
        if (slowReplies?.slow(url)) {
          await new Promise((resolve) => setTimeout(resolve, slowReplies.delayMs));
          slowReplies.delivered++;
        }
        return reply;
      },
    );
    await page.addInitScript(getExtensionRuntime(BACKEND_URL));
    await page.goto(`file:///${SIDEPANEL_HTML.replace(/\\/g, "/")}`);
    await page.waitForLoadState("domcontentloaded");
  }

  async function logIn(page: Page): Promise<void> {
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.locator("#login-btn").click();
    await expect(page.locator("#main-section")).toBeVisible({ timeout: 15000 });
  }

  test("shows login section on first load", async ({ page }) => {
    await loadSidepanel(page);
    await expect(page.locator("#login-section")).toBeVisible();
    await expect(page.locator("#main-section")).not.toBeVisible();
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

  // A return in a year newer than any the E2E user has, so the side panel
  // auto-selects it; deleted again afterwards. One at a time, since each test
  // picks the next free year.
  authedTest.describe("with a tax return", () => {
    authedTest.describe.configure({ mode: "default" });
    let seededId: string | null = null;
    let seededYear = "";

    authedTest.beforeEach(async ({ api }) => {
      seededId = null;
      const list = await api.get("/tax-returns");
      expect(list.ok()).toBe(true);
      const existing: { tax_year: number }[] = await list.json();
      const year = Math.max(new Date().getFullYear(), ...existing.map((r) => r.tax_year)) + 1;
      // head_of_household marks E2E returns, so global teardown removes any left behind.
      const res = await api.post("/tax-returns", { data: { tax_year: year, filing_status: "head_of_household" } });
      expect(res.status()).toBe(201);
      const created: { id: string; tax_year: number } = await res.json();
      seededId = created.id;
      seededYear = String(created.tax_year);
    });

    authedTest.afterEach(async ({ api }) => {
      if (seededId) expect((await api.delete(`/tax-returns/${seededId}`)).status()).toBe(204);
    });

    authedTest("after login, my tax years are listed", async ({ page }) => {
      await loadSidepanel(page);
      await logIn(page);
      await expect(page.locator("#tax-year-select")).toHaveValue(seededYear, { timeout: 10000 });
    });

    authedTest("choosing a tax year enables the form selector", async ({ page }) => {
      await loadSidepanel(page);
      await logIn(page);
      const yearSelect = page.locator("#tax-year-select");
      const formSelect = page.locator("#form-select");
      await expect(yearSelect).toHaveValue(seededYear, { timeout: 10000 });
      await expect(formSelect).toBeEnabled({ timeout: 10000 });

      await yearSelect.selectOption("");
      await expect(formSelect).toBeDisabled();

      await yearSelect.selectOption(seededYear);
      await expect(formSelect).toBeEnabled({ timeout: 10000 });
    });

    authedTest("a slow forms reply for a year I've left doesn't turn the form picker back on", async ({ page }) => {
      const slowReplies: SlowReplies = { slow: (url) => url.endsWith("/forms-overview"), delayMs: 1500, delivered: 0 };
      await loadSidepanel(page, slowReplies);
      await logIn(page);
      const yearSelect = page.locator("#tax-year-select");
      const formSelect = page.locator("#form-select");
      await expect(yearSelect).toHaveValue(seededYear, { timeout: 10000 });

      await yearSelect.selectOption("");
      await expect.poll(() => slowReplies.delivered, { timeout: 10000 }).toBe(1);
      // Let the side panel's continuation run before looking.
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      await expect(formSelect).toBeDisabled();
      await expect(formSelect.locator("option")).toHaveCount(1);
    });
    authedTest("a slow fields reply for a form page I've left doesn't show its fields", async ({ page }) => {
      const slowReplies: SlowReplies = { slow: (url) => url.includes("/forms/w2?"), delayMs: 1500, delivered: 0 };
      await loadSidepanel(page, slowReplies);
      await logIn(page);
      await expect(page.locator("#tax-year-select")).toHaveValue(seededYear, { timeout: 10000 });

      const year = Number(seededYear);
      await page.evaluate((y) => window.__mbkFromContentScript({ action: "pageDetected", form: "w2", year: y }), year);
      await page.evaluate(() => window.__mbkFromContentScript({ action: "pageDetected", form: null, year: null }));
      await expect.poll(() => slowReplies.delivered, { timeout: 10000 }).toBe(1);
      // Let the side panel's continuation run before looking.
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      await expect(page.locator("#fields-container")).toBeHidden();
    });
  });

  test("logout returns to login section", async ({ page }) => {
    await loadSidepanel(page);
    await logIn(page);

    await page.locator("#logout-btn").click();
    await expect(page.locator("#login-section")).toBeVisible();
    await expect(page.locator("#main-section")).not.toBeVisible();
  });
});
