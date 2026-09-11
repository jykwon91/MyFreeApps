/**
 * myfreeapps.org landing page, rendered the way production serves it.
 *
 * Every request to https://myfreeapps.org is fulfilled from ../public/ with the
 * headers of the `myfreeapps.org` block in infra/Caddyfile (CSP included), so a
 * change that the CSP would silently break in the browser fails here. App
 * subdomains are stubbed so card clicks can be followed without the network.
 *
 * Link ↔ Caddyfile parity is enforced separately (and on every PR) by
 * packages/shared-backend/tests/test_landing_page.py.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const CADDYFILE = path.resolve(__dirname, "..", "..", "..", "infra", "Caddyfile");
const ORIGIN = "https://myfreeapps.org";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function productionHeaders(): Record<string, string> {
  const caddyfile = fs.readFileSync(CADDYFILE, "utf-8");
  const block = /^myfreeapps\.org \{\r?\n([\s\S]*?)^\}/m.exec(caddyfile);
  if (!block) throw new Error("infra/Caddyfile has no `myfreeapps.org {` block");
  const headerBlock = /header \{\r?\n([\s\S]*?)\r?\n\s*\}/.exec(block[1]);
  if (!headerBlock) throw new Error("myfreeapps.org block has no `header { ... }`");
  const headers: Record<string, string> = {};
  for (const line of headerBlock[1].split(/\r?\n/)) {
    const directive = /^\s*([A-Za-z-]+)\s+"(.*)"\s*$/.exec(line);
    if (directive) headers[directive[1]] = directive[2];
  }
  return headers;
}

async function serveLikeProduction(page: Page): Promise<void> {
  const headers = productionHeaders();
  await page.context().route(
    (url) => url.hostname === "myfreeapps.org",
    async (route) => {
      const { pathname } = new URL(route.request().url());
      const file = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
      if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) {
        await route.fulfill({ status: 404, headers, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...headers, "Content-Type": CONTENT_TYPES[path.extname(file)] },
        body: fs.readFileSync(file),
      });
    },
  );
  await page.context().route(
    (url) => url.hostname.endsWith(".myfreeapps.org"),
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>${new URL(route.request().url()).hostname}</title>`,
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await serveLikeProduction(page);
});

test("renders every app card under the production CSP with no console errors", async ({ page }) => {
  expect(productionHeaders()["Content-Security-Policy"]).toContain("default-src 'none'");
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(`${ORIGIN}/`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Free apps, built by one developer.",
  );
  await expect(page.locator("a.app")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("stylesheet and design tokens apply in light and dark", async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  const card = page.locator("a.app").first();
  await expect(card).toHaveCSS("border-radius", "8px");
  await expect(card.locator(".app-cta")).toHaveCSS("color", "rgb(37, 99, 235)");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(2, 8, 23)");
  await expect(card.locator(".app-cta")).toHaveCSS("color", "rgb(59, 130, 246)");
});

test("each card is a single same-tab link that opens its app", async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  const cards = page.locator("a.app");
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute("href", /^https:\/\/[a-z]+\.myfreeapps\.org\/$/);
    await expect(card).not.toHaveAttribute("target", /.*/);
    await expect(card.locator("a")).toHaveCount(0);
  }

  await page.getByRole("link", { name: /MyGamingAssistant/ }).click();
  await expect(page).toHaveURL("https://mygamingassistant.myfreeapps.org/");
});

test("keyboard focus lands on the first card with a visible ring", async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  await page.keyboard.press("Tab");
  const first = page.locator("a.app").first();
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS("outline-style", "solid");
});

test("phone width stacks the cards in one column without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${ORIGIN}/`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const lefts = await page
    .locator("a.app")
    .evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().left)));
  expect(new Set(lefts).size).toBe(1);
});
