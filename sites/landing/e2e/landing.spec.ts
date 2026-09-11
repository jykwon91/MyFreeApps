/**
 * myfreeapps.org landing page, rendered the way production serves it.
 *
 * Served from ../public/ under the production headers and CSP — see
 * production-server.ts.
 *
 * Link ↔ Caddyfile parity is enforced separately (and on every PR) by
 * packages/shared-backend/tests/test_landing_page.py.
 */
import { test, expect } from "@playwright/test";
import { ORIGIN, productionHeaders, serveLikeProduction } from "./production-server";

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
