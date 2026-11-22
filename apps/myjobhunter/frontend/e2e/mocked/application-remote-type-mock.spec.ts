/**
 * No-backend E2E: the application page shows the remote type as a label
 * ("Onsite"), in the header badge and the overview, not the raw "onsite".
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication({ remote_type: "onsite" });

test("the remote type reads as a label", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}$`), (route) =>
    route.fulfill(json({ ...APPLICATION, events: [], contacts: [] })),
  );
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));

  await page.goto(`/applications/${APPLICATION.id}`);

  await expect(page.getByText("Onsite", { exact: true })).toHaveCount(2);
  await expect(page.getByText("onsite", { exact: true })).toHaveCount(0);
});
