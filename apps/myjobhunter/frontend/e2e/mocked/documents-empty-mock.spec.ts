/**
 * No-backend E2E for the Documents page's empty states: a filter that matches
 * nothing says so and can be cleared, and an account with no documents at all
 * gets the "no documents yet" state instead.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockDocument } from "./fixtures/mockData";

const DOCUMENTS_ENDPOINT = /\/api\/documents(\?|$)/;

test("a filter with no matches says so, and clearing it brings the list back", async ({ page }) => {
  await stubSignedInShell(page);
  const letter = mockDocument({ id: "d1", title: "Cover Letter Draft", kind: "cover_letter" });
  await page.route(DOCUMENTS_ENDPOINT, (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind");
    const items = kind === null ? [letter] : [];
    return route.fulfill(json({ items, total: items.length }));
  });

  await page.goto("/documents");
  await expect(page.getByText("Cover Letter Draft")).toBeVisible();

  await page.getByRole("combobox", { name: "Filter by document type" }).selectOption({ label: "Job Description" });

  await expect(page.getByText("No documents match this filter")).toBeVisible();
  await expect(page.getByText("No documents yet")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filter" }).click();

  await expect(page.getByText("Cover Letter Draft")).toBeVisible();
  await expect(page.getByText("No documents match this filter")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Filter by document type" })).toHaveValue("all");
});

test("no documents at all shows the no-documents-yet state, not the filter one", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(DOCUMENTS_ENDPOINT, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto("/documents");

  await expect(page.getByText("No documents yet")).toBeVisible();
  await expect(page.getByText("No documents match this filter")).toHaveCount(0);
});

test("the loading skeleton has the filter bar and document-shaped rows at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await stubSignedInShell(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(DOCUMENTS_ENDPOINT, async (route) => {
    await held;
    await route.fulfill(json({ items: [mockDocument({ id: "d1" })], total: 1 }));
  });

  await page.goto("/documents");

  await expect(page.getByRole("status").filter({ hasText: "Loading documents" })).toBeVisible();
  await expect(page.getByTestId("document-filter-skeleton")).toBeVisible();
  await expect(page.getByTestId("document-row-skeleton")).toHaveCount(3);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);

  release();
  await expect(page.getByText("Cover Letter Draft")).toBeVisible();
  await expect(page.getByTestId("document-row-skeleton")).toHaveCount(0);
});
