/**
 * No-backend E2E: when the answer to a stage move is lost (the connection
 * drops), the application page doesn't claim the move failed. It says it isn't
 * sure, reads the application again, and the select shows what comes back.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication();
const TRANSITIONS = new RegExp(`/api/applications/${APPLICATION.id}/transitions`);

test("a move whose answer is lost says it's unsure and reads the application again", async ({ page }) => {
  let applicationReads = 0;
  const keys: string[] = [];

  await stubSignedInShell(page);
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}$`), (route) => {
    applicationReads += 1;
    return route.fulfill(json({ ...APPLICATION, events: [], contacts: [] }));
  });
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
  await page.route(TRANSITIONS, (route) => {
    keys.push((route.request().postDataJSON() as { idempotency_key: string }).idempotency_key);
    return route.abort("connectionreset");
  });

  await page.goto(`/applications/${APPLICATION.id}`);
  const select = page.getByLabel("Change stage");
  const readsBefore = applicationReads;
  const stageBefore = await select.inputValue();

  await select.selectOption("interviewing");

  await expect(page.getByText(/Not sure the move went through/)).toBeVisible();
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue(stageBefore);
  expect(applicationReads).toBeGreaterThan(readsBefore);

  // Picking the same stage again is the same move, so it goes out with the same key.
  await select.selectOption("interviewing");
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[1]).toBe(keys[0]);
});
