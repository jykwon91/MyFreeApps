/**
 * No-backend E2E for the application's activity timeline: a skeleton while it
 * loads, an error with a working retry when it can't, and "No events yet." only
 * once the server says the list is really empty.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication();
const EVENTS = new RegExp(`/api/applications/${APPLICATION.id}/events`);

async function stubApplication(page: Page): Promise<void> {
  await stubSignedInShell(page);
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}$`), (route) =>
    route.fulfill(json({ ...APPLICATION, events: [], contacts: [] })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
}

test("the timeline shows a skeleton while loading, without a count or the empty message", async ({ page }) => {
  await stubApplication(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(EVENTS, async (route) => {
    await held;
    await route.fulfill(json({ items: [], total: 0 }));
  });

  await page.goto(`/applications/${APPLICATION.id}`);

  await expect(page.getByTestId("event-row-skeleton").first()).toBeVisible();
  await expect(page.getByText("No events yet.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Activity/ })).toHaveText("Activity");

  release();
  await expect(page.getByText("No events yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Activity/ })).toHaveText("Activity (0)");
  await expect(page.getByTestId("event-row-skeleton")).toHaveCount(0);
});

test("a failed timeline load says so and Try again brings the events back", async ({ page }) => {
  await stubApplication(page);
  let failing = true;
  await page.route(EVENTS, (route) =>
    failing
      ? route.fulfill(json({ detail: "boom" }, 500))
      : route.fulfill(json({ items: [], total: 0 })),
  );

  await page.goto(`/applications/${APPLICATION.id}`);

  await expect(page.getByText("I couldn't load the activity.")).toBeVisible();
  await expect(page.getByText("No events yet.")).toHaveCount(0);

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText("No events yet.")).toBeVisible();
  await expect(page.getByText("I couldn't load the activity.")).toHaveCount(0);
});
