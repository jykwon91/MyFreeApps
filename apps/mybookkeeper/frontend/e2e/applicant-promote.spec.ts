import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * PR 3.2 — Inquiry → Applicant promotion E2E.
 *
 * Covers the full host-driven flow:
 * 1. Seed an inquiry with PII fields populated.
 * 2. Open InquiryDetail, click "Promote to applicant".
 * 3. Verify the panel pre-fills from the inquiry.
 * 4. Submit, verify navigation to the new applicant detail page.
 * 5. Verify the new applicant carries the inquiry's name + employer.
 * 6. Try promoting the same inquiry again → 409 path navigates to existing.
 *
 * Cleanup deletes seeded inquiries + applicants per
 * ``feedback_clean_test_data``.
 */

interface SeedInquiryPayload {
  source: "FF" | "TNH" | "direct" | "other";
  external_inquiry_id?: string | null;
  inquirer_name?: string | null;
  inquirer_email?: string | null;
  inquirer_employer?: string | null;
  desired_start_date?: string | null;
  desired_end_date?: string | null;
}

async function seedInquiry(
  api: APIRequestContext,
  payload: SeedInquiryPayload,
): Promise<string> {
  const res = await api.post("/test/seed-inquiry", {
    data: { received_at: new Date().toISOString(), ...payload },
  });
  if (!res.ok()) {
    throw new Error(`seedInquiry failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteInquiry(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/inquiries/${id}`).catch(() => {});
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function waitForInquiryDetail(page: Page, inquiryId: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/inquiries/${inquiryId}$`));
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("inquiry-action-row")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Inquiry → Applicant promotion (PR 3.2)", () => {
  test("happy path: seed inquiry, promote, navigate to new applicant; second promote routes to existing", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const inquirerName = `E2E Promote ${runId}`;
    const employer = `E2E Hospital ${runId}`;

    const seededInquiries: string[] = [];
    const seededApplicantIds: string[] = [];

    try {
      const inquiryId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: inquirerName,
        inquirer_email: `e2e-promote-${runId}@example.com`,
        inquirer_employer: employer,
        desired_start_date: "2026-06-01",
        desired_end_date: "2026-12-01",
      });
      seededInquiries.push(inquiryId);

      // Open detail page.
      await page.goto(`/inquiries/${inquiryId}`);
      await waitForInquiryDetail(page, inquiryId);

      // Click "Promote to applicant".
      await page.getByTestId("inquiry-promote-button").click();
      await expect(page.getByTestId("promote-from-inquiry-panel")).toBeVisible();

      // Pre-fill verification — every field with an inquiry source should
      // already carry the value.
      await expect(page.getByTestId("promote-form-legal-name")).toHaveValue(
        inquirerName,
      );
      await expect(page.getByTestId("promote-form-employer")).toHaveValue(
        employer,
      );
      await expect(page.getByTestId("promote-form-contract-start")).toHaveValue(
        "2026-06-01",
      );
      await expect(page.getByTestId("promote-form-contract-end")).toHaveValue(
        "2026-12-01",
      );

      // Submit.
      await page.getByTestId("promote-form-submit").click();

      // Should navigate to the new applicant. URL pattern: /applicants/<uuid>.
      await page.waitForURL(/\/applicants\/[0-9a-f-]{36}$/);
      const url = new URL(page.url());
      const newApplicantId = url.pathname.split("/").pop()!;
      seededApplicantIds.push(newApplicantId);

      // Reveal sensitive section so we can verify the legal name made it through.
      await expect(page.getByTestId("sensitive-data-section")).toBeVisible({
        timeout: 10000,
      });
      await page.getByTestId("sensitive-data-toggle").click();
      await expect(page.getByTestId("sensitive-legal-name")).toHaveText(
        inquirerName,
      );
      await expect(page.getByTestId("sensitive-employer")).toHaveText(employer);

      // ---- Second promote attempt: navigate back to the inquiry detail. ----
      await page.goto(`/inquiries/${inquiryId}`);
      await waitForInquiryDetail(page, inquiryId);

      // Now the detail page should show "View applicant" instead of
      // "Promote to applicant" (the inquiry response carries
      // linked_applicant_id).
      await expect(page.getByTestId("inquiry-view-applicant-link")).toBeVisible();
      await expect(page.getByTestId("inquiry-promote-button")).toHaveCount(0);

      // Click the link → lands on the existing applicant detail page.
      await page.getByTestId("inquiry-view-applicant-link").click();
      await expect(page).toHaveURL(
        new RegExp(`/applicants/${newApplicantId}$`),
      );
    } finally {
      for (const id of seededApplicantIds) await deleteApplicant(api, id);
      for (const id of seededInquiries) await deleteInquiry(api, id);
    }
  });

  test("declined inquiries cannot be promoted — button is disabled", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seededInquiries: string[] = [];

    try {
      const inquiryId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: `E2E Declined ${runId}`,
      });
      seededInquiries.push(inquiryId);

      // Move it to declined via the inquiry stage dropdown.
      await page.goto(`/inquiries/${inquiryId}`);
      await waitForInquiryDetail(page, inquiryId);
      await page.getByTestId("inquiry-decline-button").click();
      await page.getByRole("button", { name: /^decline$/i }).click();
      await page.waitForLoadState("networkidle");

      // Promote button should now be disabled.
      const promoteBtn = page.getByTestId("inquiry-promote-button");
      await expect(promoteBtn).toBeVisible();
      await expect(promoteBtn).toBeDisabled();
    } finally {
      for (const id of seededInquiries) await deleteInquiry(api, id);
    }
  });
});
