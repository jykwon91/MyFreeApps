/**
 * No-backend E2E: while a stage move is saving, the application page's stage
 * select shows the stage that was picked and is switched off, so a second pick
 * can't send a second move. Once the move lands the select works again.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication();
const TRANSITIONS = new RegExp(`/api/applications/${APPLICATION.id}/transitions`);

test("the stage select waits for the move to finish", async ({ page }) => {
  let moves = 0;
  let finishMove: () => void = () => undefined;
  const moveFinished = new Promise<void>((resolve) => {
    finishMove = resolve;
  });

  await stubSignedInShell(page);
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}$`), (route) =>
    route.fulfill(json({ ...APPLICATION, events: [], contacts: [] })),
  );
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
  await page.route(TRANSITIONS, async (route) => {
    moves += 1;
    await moveFinished;
    await route.fulfill(json({ id: "e-1" }, 201));
  });

  await page.goto(`/applications/${APPLICATION.id}`);
  const select = page.getByLabel("Change stage");

  await select.selectOption("interviewing");

  await expect(select).toBeDisabled();
  await expect(select).toHaveValue("interviewing");
  expect(moves).toBe(1);

  finishMove();
  await expect(page.getByText("Moved to Interviewing")).toBeVisible();
  await expect(select).toBeEnabled();
});
