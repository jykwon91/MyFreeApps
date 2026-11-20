/**
 * No-backend E2E: after the web box has saved its own notes, an edit made on the phone shows up
 * once the window regains focus (the refetch), and the next keystroke saves on top of it.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication({ notes: "start" });
const DETAIL = new RegExp(`/api/applications/${APPLICATION.id}$`);

test("notes edited elsewhere appear after a refetch, even after this box saved", async ({ page }) => {
  await stubSignedInShell(page);
  let serverNotes = "start";
  const patched: unknown[] = [];
  await page.route(DETAIL, (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { notes: string };
      patched.push(body);
      serverNotes = body.notes;
      return route.fulfill(json({ ...APPLICATION, notes: serverNotes, events: [], contacts: [] }));
    }
    return route.fulfill(json({ ...APPLICATION, notes: serverNotes, events: [], contacts: [] }));
  });
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
  await page.route(/\/api\/applications\?view=kanban/, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto(`/dashboard?app=${APPLICATION.id}`);
  const notes = page.getByLabel("Application notes");
  await notes.fill("from web");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  serverNotes = "from phone";
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(notes).toHaveValue("from phone");

  await notes.pressSequentially("!");
  await expect.poll(() => patched.length).toBe(2);
  expect(patched[1]).toEqual({ notes: "from phone!" });
});
