/**
 * No-backend E2E: a lease's Files tab says which template name + version its
 * documents were generated from. Runs under playwright.layout.config.ts.
 *
 * The draft shows nothing (nothing rendered yet). Generating answers with the
 * snapshot the server recorded; the label shows that snapshot, not the
 * template's current (renamed, re-versioned) name, and drops the version when
 * the server could not know it.
 */
import { test, expect, type Page } from "@playwright/test";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { APPLICANT_DETAIL, APPLICANT_ID } from "./fixtures/mockApplicant";
import { DRAFT_LEASE, LEASE_ID } from "./fixtures/mockLease";

const [MASTER, ADDENDUM] = DRAFT_LEASE.templates;

const GENERATED_LEASE: SignedLeaseDetail = {
  ...DRAFT_LEASE,
  status: "generated",
  generated_at: "2026-11-02T00:00:00Z",
  templates: [
    { ...MASTER, template_name_snapshot: "Master Lease", template_version_snapshot: 2 },
    { ...ADDENDUM, template_name_snapshot: "Pet addendum", template_version_snapshot: null },
  ],
};

async function stubLease(page: Page): Promise<{ generateCalls: () => number }> {
  let current: SignedLeaseDetail = DRAFT_LEASE;
  let calls = 0;
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}$`), (route) => route.fulfill(json(APPLICANT_DETAIL)));
  await page.route(new RegExp(`/api/signed-leases/${LEASE_ID}$`), (route) => route.fulfill(json(current)));
  await page.route(new RegExp(`/api/signed-leases/${LEASE_ID}/generate$`), (route) => {
    calls += 1;
    current = GENERATED_LEASE;
    return route.fulfill(json(GENERATED_LEASE));
  });
  return { generateCalls: () => calls };
}

test("generating a lease shows which template name and version each document came from", async ({ page }) => {
  const { generateCalls } = await stubLease(page);

  await page.goto(`/leases/${LEASE_ID}`);
  await expect(page.getByTestId("lease-generate-button")).toHaveText(/Generate/);
  await expect(page.getByTestId("lease-template-sources")).toHaveCount(0);

  await page.getByTestId("lease-generate-button").click();

  const sources = page.getByTestId("lease-template-source");
  await expect(sources).toHaveText(["Generated from Master Lease v2", "Generated from Pet addendum"]);
  await expect(page.getByTestId("lease-template-sources")).not.toContainText(MASTER.name);
  expect(generateCalls()).toBe(1);

  // Survives a reload: the label comes from the stored snapshot, not the click.
  await page.reload();
  await expect(sources).toHaveText(["Generated from Master Lease v2", "Generated from Pet addendum"]);
});
