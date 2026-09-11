/**
 * myfreeapps.org/jason/ — the portfolio page linked from job applications.
 * Served from ../public/ under the production headers and CSP — see
 * production-server.ts. Screenshots in public/jason/img/ are produced by
 * ../capture/ (not run in CI).
 */
import { test, expect } from "@playwright/test";
import { ORIGIN, serveLikeProduction } from "./production-server";

const PAGE = `${ORIGIN}/jason/`;

test.beforeEach(async ({ page }) => {
  await serveLikeProduction(page);
});

test("renders under the production CSP with every screenshot loaded", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(PAGE);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jason Kwon");
  await expect(page.locator(".stat")).toHaveCount(4);
  await expect(page.locator(".project")).toHaveCount(3);
  await expect(page.locator(".job")).toHaveCount(5);

  const screenshots = page.locator("main img");
  await expect(screenshots).toHaveCount(4);
  for (const img of await screenshots.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await expect(img).toHaveAttribute("alt", /.{20,}/);
  }
  expect(errors).toEqual([]);
});

test("styles from both stylesheets apply in light and dark", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator(".role")).toHaveCSS("color", "rgb(37, 99, 235)");
  await expect(page.locator(".project").first()).toHaveCSS("border-radius", "8px");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(2, 8, 23)");
});

test("publishes no phone number or street address", async ({ page }) => {
  await page.goto(PAGE);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\(?\d{3}\)?[\s.-]\d{3}-\d{4}/);
  expect(text).not.toMatch(/\b\d{3,5}\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Ln|Lane)\b/);
});

test("every link is https or mailto, and the landing page never links here", async ({ page }) => {
  await page.goto(PAGE);
  for (const href of await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
    expect(href).toMatch(/^(https:\/\/|mailto:|\/jason\/|#)/);
  }

  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('a[href*="/jason"]')).toHaveCount(0);
});

test("phone width stacks to one column without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PAGE);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const lefts = await page
    .locator(".project")
    .evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().left)));
  expect(new Set(lefts).size).toBe(1);
});
