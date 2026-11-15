/**
 * No-backend E2E: moving from a lease to its successor and back must not carry
 * the other lease's notes, and blurring the notes box never saves one lease's
 * notes onto another. Runs under playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { APPLICANT_DETAIL, APPLICANT_ID } from "./fixtures/mockApplicant";
import { DRAFT_LEASE, LEASE_ID } from "./fixtures/mockLease";

const SUCCESSOR_ID = "00000000-0000-0000-0000-0000000000c2";

const FIRST: SignedLeaseDetail = {
  ...DRAFT_LEASE,
  status: "signed",
  notes: "Notes for the first lease",
  successor_lease_id: SUCCESSOR_ID,
};
const SECOND: SignedLeaseDetail = {
  ...DRAFT_LEASE,
  id: SUCCESSOR_ID,
  status: "signed",
  notes: "Notes for the successor",
  parent_lease_id: LEASE_ID,
};

test("going to the successor and back shows each lease's own notes and saves nothing", async ({ page }) => {
  const saves: string[] = [];
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}$`), (route) => route.fulfill(json(APPLICANT_DETAIL)));
  await page.route(new RegExp(`/api/signed-leases/(${LEASE_ID}|${SUCCESSOR_ID})$`), (route) => {
    if (route.request().method() !== "GET") {
      saves.push(route.request().url());
      return route.fulfill(json(FIRST));
    }
    return route.fulfill(json(route.request().url().endsWith(SUCCESSOR_ID) ? SECOND : FIRST));
  });

  await page.goto(`/leases/${LEASE_ID}`);
  await page.getByTestId("lease-tab-notes").click();
  await expect(page.getByLabel("Internal notes")).toHaveValue("Notes for the first lease");

  await page.getByTestId("lease-successor-link").click();
  await page.getByTestId("lease-tab-notes").click();
  await expect(page.getByLabel("Internal notes")).toHaveValue("Notes for the successor");

  await page.getByTestId("lease-parent-link").click();
  await page.getByTestId("lease-tab-notes").click();
  const notes = page.getByLabel("Internal notes");
  await expect(notes).toHaveValue("Notes for the first lease");

  await notes.focus();
  await notes.blur();
  expect(saves).toEqual([]);
});
