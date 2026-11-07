import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PAGES_DIR = path.resolve(__dirname, "../../chrome-extension/test-pages");
const CONTENT_JS = path.resolve(__dirname, "../../chrome-extension/content.js");

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
