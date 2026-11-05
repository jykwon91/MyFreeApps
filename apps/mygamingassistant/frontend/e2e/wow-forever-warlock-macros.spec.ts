/**
 * WoW Forever "Warlock macros" — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-warlock-macros
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("reaches the page from the landing card", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /^Warlock macros/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/warlock-macros$/);
  await expect(page.getByRole("heading", { name: "Warlock macros", level: 1 })).toBeVisible();
});

test("shows the how-to and every macro, with unconfirmed syntax labelled", async ({ page }) => {
  await page.goto("/wow-forever/warlock-macros");
  await expect(page.getByRole("heading", { name: "How to make a macro" })).toBeVisible();
  await expect(page.getByText("/macro", { exact: true })).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(10);

  const focus = page.getByRole("article", { name: "Fear your focus" });
  await expect(focus.getByTestId("macro-text")).toHaveText("/cast [@focus,harm,nodead][] Fear");
  await expect(focus.getByText("Unconfirmed")).toBeVisible();
  const healthstone = page.getByRole("article", { name: "Use your Healthstone" });
  await expect(healthstone.getByTestId("macro-text")).toContainText("/use Major Healthstone");
  await expect(healthstone.getByText(/Names checked against the Forever client/)).toBeVisible();
  await expect(healthstone.getByText("Unconfirmed")).toHaveCount(0);
});

test("Copy puts the macro on the clipboard and shows a toast", async ({ page }) => {
  await page.goto("/wow-forever/warlock-macros");
  const card = page.getByRole("article", { name: "Stop casting, then Fear" });
  const button = card.getByRole("button", { name: "Copy macro: Stop casting, then Fear" });
  await button.click();
  await expect(button).toContainText("Copied");
  await expect(page.getByText('Copied "Stop casting, then Fear"', { exact: true })).toBeVisible();
  // Windows browsers hand the clipboard back with CRLF line ends.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe("/stopcasting\n/cast Fear");
});

test("a refused clipboard shows an error toast, not a false success", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.goto("/wow-forever/warlock-macros");
  await page.getByRole("button", { name: "Copy macro: Life Tap" }).click();
  await expect(
    page.getByText("Couldn't copy \"Life Tap\". Select the text and copy it by hand.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Copied "Life Tap"', { exact: true })).toHaveCount(0);
});

test("the phone layout never scrolls sideways and keeps touch targets large", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/warlock-macros");
  const copy = page.getByRole("button", { name: "Copy macro: Life Tap" });
  await expect(copy).toBeVisible();
  const box = await copy.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  // The longest macro stays inside its card.
  await expect(page.getByRole("article", { name: "Damage-over-time opener" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
