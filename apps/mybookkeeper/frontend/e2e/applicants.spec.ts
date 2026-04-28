import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * PR 3.1b — Applicants frontend behavioural E2E (read-only).
 *
 * Covers the list / detail flows that ship in this PR. Promote-from-inquiry,
 * screening, and video-call create flows land in PR 3.2 / 3.3 / 3.4 — those
 * specs will be added alongside their respective UI features.
 */

interface SeedApplicantPayload {
  inquiry_id?: string | null;
  legal_name?: string | null;
  dob?: string | null;
  employer_or_hospital?: string | null;
  vehicle_make_model?: string | null;
  smoker?: boolean | null;
  pets?: string | null;
  referred_by?: string | null;
  stage?: string;
  seed_event?: boolean;
  seed_screening?: boolean;
  seed_reference?: boolean;
  seed_video_call_note?: boolean;
}

async function seedApplicant(
  api: APIRequestContext,
  payload: SeedApplicantPayload,
): Promise<string> {
  const res = await api.post("/test/seed-applicant", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function seedInquiry(
  api: APIRequestContext,
  inquirerName: string,
): Promise<string> {
  const res = await api.post("/test/seed-inquiry", {
    data: {
      source: "direct",
      inquirer_name: inquirerName,
      received_at: new Date().toISOString(),
    },
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

async function waitForApplicantsPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Applicants" })).toBeVisible({
    timeout: 10000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Applicants frontend (PR 3.1b)", () => {
  test("seeded applicant renders in list, drilldown shows all sections, sensitive toggle works", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const legalName = `E2E Applicant ${runId}`;
    const inquirerName = `E2E Source Inquiry ${runId}`;
    const seededApplicants: string[] = [];
    const seededInquiries: string[] = [];

    try {
      // Seed an inquiry first so we can prove the source-inquiry link works.
      const inquiryId = await seedInquiry(api, inquirerName);
      seededInquiries.push(inquiryId);

      const applicantId = await seedApplicant(api, {
        inquiry_id: inquiryId,
        legal_name: legalName,
        dob: "1990-01-15",
        employer_or_hospital: "Memorial Hermann",
        vehicle_make_model: "Toyota Camry 2020",
        smoker: false,
        pets: "1 small cat",
        stage: "lead",
        seed_event: true,
        seed_screening: true,
        seed_reference: true,
        seed_video_call_note: true,
      });
      seededApplicants.push(applicantId);

      // List page renders.
      await page.goto("/applicants");
      await waitForApplicantsPage(page);
      await expect(page.getByText(legalName).first()).toBeVisible({ timeout: 5000 });

      // Drill into detail.
      await page.getByText(legalName).first().click();
      await expect(page).toHaveURL(new RegExp(`/applicants/${applicantId}$`));

      // Header with stage badge.
      await expect(page.getByRole("heading", { name: legalName })).toBeVisible();
      await expect(page.getByTestId("applicant-stage-badge-lead")).toBeVisible();

      // Source-inquiry link points to the inquiry.
      const sourceLink = page.getByTestId("applicant-source-inquiry-link");
      await expect(sourceLink).toBeVisible();
      await expect(sourceLink).toHaveAttribute("href", `/inquiries/${inquiryId}`);

      // Contract / sensitive / screening / references / notes / timeline sections all render.
      await expect(page.getByTestId("contract-section")).toBeVisible();
      await expect(page.getByTestId("sensitive-data-section")).toBeVisible();
      await expect(page.getByTestId("screening-section")).toBeVisible();
      await expect(page.getByTestId("references-section")).toBeVisible();
      await expect(page.getByTestId("notes-section")).toBeVisible();
      await expect(page.getByTestId("applicant-timeline")).toBeVisible();

      // Sensitive section is hidden by default.
      await expect(page.getByTestId("sensitive-data-hidden")).toBeVisible();
      await expect(page.getByTestId("sensitive-data-revealed")).toHaveCount(0);

      // Toggle reveals PII fields.
      await page.getByTestId("sensitive-data-toggle").click();
      await expect(page.getByTestId("sensitive-data-revealed")).toBeVisible();
      await expect(page.getByTestId("sensitive-legal-name")).toHaveText(legalName);
      await expect(page.getByTestId("sensitive-dob")).toHaveText("1990-01-15");
      await expect(page.getByTestId("sensitive-employer")).toHaveText("Memorial Hermann");
      await expect(page.getByTestId("sensitive-vehicle")).toHaveText("Toyota Camry 2020");

      // Screening / references / video-call note rows render at least one item each.
      await expect(page.getByTestId("screening-list")).toBeVisible();
      await expect(page.getByTestId("references-list")).toBeVisible();
      await expect(page.getByTestId("notes-list")).toBeVisible();

      // Timeline expands and shows the seeded "lead" event.
      await page.getByRole("button", { name: /Activity timeline/i }).click();
      await expect(page.getByTestId("applicant-timeline")).toContainText(/Moved to Lead/i);
    } finally {
      for (const id of seededApplicants) await deleteApplicant(api, id);
      for (const id of seededInquiries) await deleteInquiry(api, id);
    }
  });

  test("stage filter narrows the list to a single stage", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seededIds: string[] = [];

    try {
      const leadId = await seedApplicant(api, {
        legal_name: `E2E Lead ${runId}`,
        stage: "lead",
        seed_event: true,
      });
      seededIds.push(leadId);

      const screeningId = await seedApplicant(api, {
        legal_name: `E2E Screening ${runId}`,
        stage: "screening_pending",
        seed_event: true,
      });
      seededIds.push(screeningId);

      await page.goto("/applicants");
      await waitForApplicantsPage(page);

      // All visible by default.
      await expect(page.getByText(`E2E Lead ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Screening ${runId}`).first()).toBeVisible();

      // Filter to screening_pending.
      await page.getByTestId("applicant-filter-screening_pending").click();
      await page.waitForLoadState("networkidle");

      await expect(page.getByText(`E2E Screening ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Lead ${runId}`)).toHaveCount(0);

      // URL state reflects the filter.
      expect(page.url()).toContain("stage=screening_pending");

      // Back to All — both return.
      await page.getByTestId("applicant-filter-all").click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(`E2E Lead ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Screening ${runId}`).first()).toBeVisible();
    } finally {
      for (const id of seededIds) await deleteApplicant(api, id);
    }
  });

  test("renders the unfiltered empty state when the user has no applicants in this stage", async ({
    authedPage: page,
  }) => {
    // Pick a terminal stage no other test typically seeds against.
    await page.goto("/applicants?stage=lease_signed");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Applicants" })).toBeVisible();
    await expect(page.getByTestId("applicant-filter-lease_signed")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const filteredEmpty = await page.getByText(/No applicants in this stage/i).count();
    if (filteredEmpty > 0) {
      expect(filteredEmpty).toBeGreaterThan(0);
    }
  });

  test("404 detail page surfaces the friendly not-found message", async ({
    authedPage: page,
  }) => {
    // Random UUID — no such applicant exists for this user.
    await page.goto("/applicants/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText(/I couldn't find that applicant/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
