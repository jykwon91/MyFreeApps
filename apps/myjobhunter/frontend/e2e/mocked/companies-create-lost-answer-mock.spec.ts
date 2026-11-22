/**
 * No-backend E2E: when the answer to adding a company is lost, the dialog reads
 * the companies list again instead of inviting a second try. A new company with
 * the name means it went through; a list it can't read means it isn't sure.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockCompany } from "./fixtures/mockData";
import type { Company } from "@myjobhunter/api-client/types/company";

const COMPANIES_ENDPOINT = /\/api\/companies(\?|$)/;

/** The POST lands but its answer is lost; `readable` says whether the list still answers after that. */
async function stubLostCreate(page: Page, store: Company[], readable: boolean): Promise<() => number> {
  let posts = 0;
  await page.route(COMPANIES_ENDPOINT, (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      store.push(mockCompany({ id: "created-1", name: String((route.request().postDataJSON() as { name: string }).name) }));
      return route.abort("connectionreset");
    }
    if (posts > 0 && !readable) return route.abort("connectionreset");
    return route.fulfill(json({ items: store, total: store.length }));
  });
  return () => posts;
}

async function addGlobex(page: Page) {
  await page.goto("/companies");
  await expect(page.getByRole("cell", { name: "Acme Corp" })).toBeVisible();
  await page.getByRole("button", { name: "Add company" }).click();
  await page.getByPlaceholder("e.g. Acme Corp").fill("Globex");
  await page.getByRole("dialog").getByRole("button", { name: "Add company" }).click();
}

test("a company whose answer is lost but is on the list counts as added", async ({ page }) => {
  await stubSignedInShell(page);
  const posts = await stubLostCreate(page, [mockCompany()], true);

  await addGlobex(page);

  await expect(page.getByText('Company "Globex" added', { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Globex", exact: true })).toBeVisible();
  expect(posts()).toBe(1);
});

test("a company whose answer is lost and whose list can't be read says it isn't sure", async ({ page }) => {
  await stubSignedInShell(page);
  await stubLostCreate(page, [mockCompany()], false);

  await addGlobex(page);

  // The toast region only: for its first second Radix also keeps a hidden screen-reader copy of the toast text.
  // The region counts hidden nodes because the dialog stays open over the kept list, and an open modal dialog marks
  // everything outside it aria-hidden; the toast itself is still on screen (toBeVisible) and still announced.
  await expect(
    page
      .getByRole("region", { name: "Notifications", includeHidden: true })
      .getByText(/not sure that saved\. Check your companies before trying again/),
  ).toBeVisible();
  await expect(page.getByText('Company "Globex" added', { exact: true })).toHaveCount(0);
  // Nothing was confirmed, so the dialog keeps what was typed instead of being swapped out for an error page.
  await expect(page.getByRole("dialog").getByPlaceholder("e.g. Acme Corp")).toHaveValue("Globex");
});
