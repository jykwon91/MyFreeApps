/**
 * No-backend E2E for the Applications list: skeleton while loading, rows once
 * the stubbed list answers, the empty state, and the error state on a 500.
 */
import { test, expect } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { stubSignedInShell } from "./fixtures/mockSession";
import { mockApplication } from "./fixtures/mockData";

const APPLICATIONS_ENDPOINT = /\/api\/applications(\?|$)/;

test("shows the skeleton, then the stubbed applications as rows", async ({ page }) => {
  await stubSignedInShell(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(APPLICATIONS_ENDPOINT, async (route) => {
    await held;
    await route.fulfill(
      json({
        items: [
          mockApplication({ id: "a1", role_title: "Staff Engineer", company_name: "Acme Corp", latest_status: "applied" }),
          mockApplication({ id: "a2", role_title: "Data Scientist", company_name: "Globex", latest_status: "interview" }),
        ],
        total: 2,
      }),
    );
  });

  await page.goto("/applications");
  await expect(page.getByLabel("Loading applications")).toBeVisible();

  release();
  await expect(page.getByLabel("Loading applications")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Staff Engineer" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Globex" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("an empty list shows the empty state with its call to action", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(APPLICATIONS_ENDPOINT, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto("/applications");

  await expect(page.getByText("No applications yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add application" })).toBeVisible();
});

test("a 500 shows the error state, never the empty state", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(APPLICATIONS_ENDPOINT, (route) => route.fulfill(json({ detail: "boom" }, 500)));

  await page.goto("/applications");

  await expect(page.getByText("Couldn't load applications")).toBeVisible();
  await expect(page.getByText("The server returned 500. Try refreshing.")).toBeVisible();
  await expect(page.getByText("No applications yet")).toHaveCount(0);
});
