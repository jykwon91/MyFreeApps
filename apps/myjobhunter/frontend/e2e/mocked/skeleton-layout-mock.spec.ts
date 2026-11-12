/**
 * No-backend E2E: the Applications skeleton mirrors the loaded page, with the
 * same column headers in the same order, so the table does not shift when data
 * arrives. The loaded table holds five rows, matching the skeleton's five.
 */
import { test, expect, type Locator } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication } from "./fixtures/mockData";

const APPLICATIONS_ENDPOINT = /\/api\/applications(\?|$)/;

async function headerTexts(scope: Locator): Promise<string[]> {
  return (await scope.getByRole("columnheader").allInnerTexts()).map((t) => t.trim());
}

test("applications skeleton has the loaded table's columns and row count", async ({ page }) => {
  await stubSignedInShell(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const items = Array.from({ length: 5 }, (_, i) => mockApplication({ id: `a${i}`, role_title: `Role ${i}` }));
  await page.route(APPLICATIONS_ENDPOINT, async (route) => {
    await held;
    await route.fulfill(json({ items, total: items.length }));
  });

  await page.goto("/applications");
  const skeleton = page.getByLabel("Loading applications");
  await expect(skeleton).toBeVisible();
  const skeletonHeaders = await headerTexts(skeleton);
  const skeletonRows = await skeleton.locator("tbody tr").count();

  release();
  await expect(page.getByRole("cell", { name: "Role 0" })).toBeVisible();
  const table = page.getByRole("table");
  expect(await headerTexts(table)).toEqual(skeletonHeaders);
  expect(await table.locator("tbody tr").count()).toBe(skeletonRows);
});
