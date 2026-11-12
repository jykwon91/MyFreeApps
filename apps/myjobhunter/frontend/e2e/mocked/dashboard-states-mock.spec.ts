/**
 * No-backend E2E for /dashboard: the skeleton has the loaded board's columns
 * and lanes, a failed load shows an error with Retry (not the empty state), and
 * the header counts only non-closed applications.
 */
import { test, expect } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { stubSignedInShell } from "@platform/ui/testing/mockSession";

const KANBAN_ENDPOINT = /\/api\/applications\?view=kanban/;

function card(id: string, latest_event_type: string) {
  return {
    id,
    role_title: `Role ${id}`,
    applied_at: null,
    archived: false,
    company_id: "c1",
    company_name: "Acme",
    company_logo_url: null,
    latest_event_type,
    stage_entered_at: "2026-11-01T00:00:00+00:00",
    verdict: null,
  };
}

test("dashboard skeleton has the loaded board's columns and lanes", async ({ page }) => {
  await stubSignedInShell(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(KANBAN_ENDPOINT, async (route) => {
    await held;
    await route.fulfill(json({ items: [card("1", "applied"), card("2", "rejected")] }));
  });

  await page.goto("/dashboard");
  const skeleton = page.getByLabel("Loading dashboard");
  await expect(skeleton).toBeVisible();
  const skeletonColumns = await skeleton.locator("[data-skeleton-column]").count();
  const skeletonLanes = await skeleton.locator("[data-skeleton-lane]").count();

  release();
  await expect(page.getByText("Role 1")).toBeVisible();
  expect(await page.locator("[data-kanban-column]").count()).toBe(skeletonColumns);
  expect(await page.getByRole("button", { name: /lane$/i }).count()).toBe(skeletonLanes);
  await expect(page.getByText("1 active application")).toBeVisible();
});

test("a failed board load shows an error and Retry recovers", async ({ page }) => {
  await stubSignedInShell(page);
  let failing = true;
  await page.route(KANBAN_ENDPOINT, (route) =>
    failing ? route.fulfill(json({ detail: "boom" }, 500)) : route.fulfill(json({ items: [card("1", "applied")] })),
  );

  await page.goto("/dashboard");
  await expect(page.getByText("We couldn't load your board")).toBeVisible();
  await expect(page.getByText("Your hunt starts here")).toHaveCount(0);

  failing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Role 1")).toBeVisible();
});
