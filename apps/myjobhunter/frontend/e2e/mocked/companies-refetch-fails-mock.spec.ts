/**
 * No-backend E2E for the Companies page when a refresh fails: loaded rows stay
 * on screen under a notice with Try again; with nothing loaded, a full error
 * with Try again shows and recovers on retry.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockCompany } from "./fixtures/mockData";

const COMPANIES_ENDPOINT = /\/api\/companies(\?|$)/;

test("a failed refresh keeps the loaded companies under a notice", async ({ page }) => {
  await stubSignedInShell(page);
  let failing = false;
  await page.route(COMPANIES_ENDPOINT, (route) =>
    failing ? route.fulfill(json({ detail: "boom" }, 500)) : route.fulfill(json({ items: [mockCompany()], total: 1 })),
  );

  await page.goto("/companies");
  await expect(page.getByRole("cell", { name: "Acme Corp" })).toBeVisible();

  failing = true;
  // Switching tabs back triggers a refetch on focus; dispatch it directly.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/We couldn't refresh them/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Acme Corp" })).toBeVisible();

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/We couldn't refresh them/)).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Acme Corp" })).toBeVisible();
});

test("with nothing loaded, the error offers Try again and recovers", async ({ page }) => {
  await stubSignedInShell(page);
  let failing = true;
  await page.route(COMPANIES_ENDPOINT, (route) =>
    failing ? route.fulfill(json({ detail: "boom" }, 500)) : route.fulfill(json({ items: [mockCompany()], total: 1 })),
  );

  await page.goto("/companies");
  await expect(page.getByText("We couldn't load your companies.")).toBeVisible();

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("cell", { name: "Acme Corp" })).toBeVisible();
});
