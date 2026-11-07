import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
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

// The side panel loaded as a page, with background.js running inside it. Most
// tests need no signed-in user; the ones that seed data use authedTest for its
// API client.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIDEPANEL_HTML = path.resolve(__dirname, "../../chrome-extension/sidepanel.html");
const BACKGROUND_JS = path.resolve(__dirname, "../../chrome-extension/background.js");

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

  async function seedW2(api: APIRequestContext, returnId: string | null): Promise<void> {
    expect(returnId).not.toBeNull();
    const res = await api.post(`/test/tax-returns/${returnId}/seed-form-instance`, { data: { form_name: "w2" } });
    expect(res.status()).toBe(201);
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

    authedTest("changing the tax year away and back keeps the detected form selected", async ({ page, api }) => {
      await seedW2(api, seededId);
      await loadSidepanel(page);
      await logIn(page);
      const yearSelect = page.locator("#tax-year-select");
      const formSelect = page.locator("#form-select");
      await expect(yearSelect).toHaveValue(seededYear, { timeout: 10000 });
      await expect(formSelect).toBeEnabled({ timeout: 10000 });

      await page.evaluate((y) => window.__mbkFromContentScript({ action: "pageDetected", form: "w2", year: y }), Number(seededYear));
      await expect(formSelect).toHaveValue("w2");

      await yearSelect.selectOption("");
      await yearSelect.selectOption(seededYear);
      await expect(formSelect).toHaveValue("w2", { timeout: 10000 });
    });

    authedTest("a form page for another tax year lists that year's forms", async ({ page, api }) => {
      await seedW2(api, seededId);
      const res = await api.post("/tax-returns", {
        data: { tax_year: Number(seededYear) + 1, filing_status: "head_of_household" },
      });
      expect(res.status()).toBe(201);
      const newer: { id: string } = await res.json();
      try {
        await loadSidepanel(page);
        await logIn(page);
        const formSelect = page.locator("#form-select");
        await expect(page.locator("#tax-year-select")).toHaveValue(String(Number(seededYear) + 1), { timeout: 10000 });
        await expect(formSelect).toBeEnabled({ timeout: 10000 });

        await page.evaluate((y) => window.__mbkFromContentScript({ action: "pageDetected", form: "w2", year: y }), Number(seededYear));
        await expect(page.locator("#tax-year-select")).toHaveValue(seededYear);
        await expect(formSelect).toHaveValue("w2", { timeout: 10000 });
      } finally {
        // No assertion here, so a cleanup failure can't hide the test's own; global teardown removes leftovers.
        await api.delete(`/tax-returns/${newer.id}`);
      }
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
