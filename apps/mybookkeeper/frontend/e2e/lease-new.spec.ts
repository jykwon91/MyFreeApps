import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * E2E tests for /leases/new — the generate-lease page.
 *
 * Covers:
 * 1. Entry via "Generate lease" button on the Leases list page.
 * 2. Template picker → applicant picker → form → submit → navigate to lease detail.
 * 3. Deep-link with ?template_id pre-selects template, shows applicant picker.
 * 4. Deep-link with ?applicant_id pre-selects applicant, shows template picker.
 * 5. Back to leases link works.
 * 6. Applicant picker shows approved/lease_sent; excludes lease_signed.
 * 7. Entry via "Generate lease..." button on the lease templates list page.
 * 8. Entry via "Generate lease" button on the applicant detail page
 *    (stage=approved).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedTemplate(
  api: APIRequestContext,
  payload: { name?: string; source_text?: string } = {},
): Promise<string> {
  const res = await api.post("/test/seed-lease-template", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedTemplate failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteTemplate(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/lease-templates/${id}`).catch(() => {});
}

async function seedApplicant(
  api: APIRequestContext,
  payload: {
    legal_name?: string | null;
    stage?: string;
    inquiry_id?: string | null;
  } = {},
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { stage: "lead", seed_event: false, ...payload },
  });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function deleteSignedLease(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/signed-leases/${id}`).catch(() => {});
}

async function transitionApplicantStage(
  api: APIRequestContext,
  applicantId: string,
  stage: string,
): Promise<void> {
  const res = await api.patch(`/applicants/${applicantId}/stage`, {
    data: { stage },
  });
  if (!res.ok()) {
    throw new Error(
      `transitionApplicantStage failed: ${res.status()} ${await res.text()}`,
    );
  }
}

async function waitForLeasesPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Leases" })).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForLoadState("networkidle");
}

async function waitForLeaseNewPage(page: Page): Promise<void> {
  await expect(page.getByTestId("lease-new-page")).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Lease New page (/leases/new)", () => {
  test(
    "back to leases link navigates to /leases",
    async ({ authedPage: page }) => {
      await page.goto("/leases/new");
      await waitForLeaseNewPage(page);

      await page.getByTestId("lease-new-back-link").click();
      await waitForLeasesPage(page);
    },
  );

  test(
    "generate lease button on leases list opens /leases/new",
    async ({ authedPage: page }) => {
      await page.goto("/leases");
      await waitForLeasesPage(page);

      const btn = page.getByTestId("generate-lease-button");
      await expect(btn).toBeVisible();
      await btn.click();

      await waitForLeaseNewPage(page);
      expect(page.url()).toContain("/leases/new");
    },
  );

  test(
    "template picker shown when no template_id in URL",
    async ({ authedPage: page }) => {
      await page.goto("/leases/new");
      await waitForLeaseNewPage(page);

      await expect(page.getByTestId("template-picker-section")).toBeVisible();
    },
  );

  test(
    "applicant picker shown after template pre-selected via URL",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const seededTemplateIds: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E LeaseNew Template ${runId}`,
        });
        seededTemplateIds.push(templateId);

        await page.goto(`/leases/new?template_id=${templateId}`);
        await waitForLeaseNewPage(page);

        await expect(page.getByTestId("applicant-picker-section")).toBeVisible({
          timeout: 10_000,
        });
      } finally {
        for (const id of seededTemplateIds) await deleteTemplate(api, id);
      }
    },
  );

  test(
    "applicant picker excludes lease_signed applicants",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const seededTemplateIds: string[] = [];
      const seededApplicantIds: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E ApplicantPicker Filter ${runId}`,
        });
        seededTemplateIds.push(templateId);

        // Seed an approved applicant and a lease_signed applicant.
        const approvedId = await seedApplicant(api, {
          legal_name: `Approved Tenant ${runId}`,
          stage: "approved",
        });
        seededApplicantIds.push(approvedId);

        const signedId = await seedApplicant(api, {
          legal_name: `Signed Tenant ${runId}`,
        });
        seededApplicantIds.push(signedId);
        await transitionApplicantStage(api, signedId, "approved");
        await transitionApplicantStage(api, signedId, "lease_sent");
        await transitionApplicantStage(api, signedId, "lease_signed");

        await page.goto(`/leases/new?template_id=${templateId}`);
        await waitForLeaseNewPage(page);
        await page.waitForLoadState("networkidle");

        // Approved applicant should appear.
        await expect(
          page.getByTestId(`applicant-option-${approvedId}`),
        ).toBeVisible({ timeout: 10_000 });

        // lease_signed applicant must NOT appear.
        await expect(
          page.getByTestId(`applicant-option-${signedId}`),
        ).not.toBeVisible();
      } finally {
        for (const id of seededTemplateIds) await deleteTemplate(api, id);
        for (const id of seededApplicantIds) await deleteApplicant(api, id);
      }
    },
  );

  test(
    "full happy path — pick template → pick applicant → generate → navigate to lease detail",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const seededTemplateIds: string[] = [];
      const seededApplicantIds: string[] = [];
      const seededLeaseIds: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E Generate Full ${runId}`,
        });
        seededTemplateIds.push(templateId);

        const applicantId = await seedApplicant(api, {
          legal_name: `Full Generate Tenant ${runId}`,
          stage: "approved",
        });
        seededApplicantIds.push(applicantId);

        // Navigate to /leases/new — no pre-selected IDs.
        await page.goto("/leases/new");
        await waitForLeaseNewPage(page);

        // Step 1 — pick template.
        await expect(page.getByTestId("template-picker-section")).toBeVisible();
        await page.waitForLoadState("networkidle");
        const templateOption = page.getByTestId(`template-option-${templateId}`);
        await expect(templateOption).toBeVisible({ timeout: 10_000 });
        await templateOption.click();

        // Step 2 — pick applicant.
        await expect(
          page.getByTestId("applicant-picker-section"),
        ).toBeVisible({ timeout: 10_000 });
        await page.waitForLoadState("networkidle");
        const applicantOption = page.getByTestId(
          `applicant-option-${applicantId}`,
        );
        await expect(applicantOption).toBeVisible({ timeout: 10_000 });
        await applicantOption.click();

        // Step 3 — form should appear.
        await expect(
          page.getByTestId("lease-generate-form-section"),
        ).toBeVisible({ timeout: 15_000 });

        // Submit the form (defaults should be auto-filled).
        await page.waitForLoadState("networkidle");
        const submitBtn = page.getByTestId("lease-generate-submit");
        await expect(submitBtn).toBeVisible({ timeout: 10_000 });
        await submitBtn.click();

        // Should navigate to /leases/<id>.
        await page.waitForURL(/\/leases\/[0-9a-f-]{36}$/, { timeout: 15_000 });
        const leaseId = page.url().split("/leases/")[1];
        if (leaseId) seededLeaseIds.push(leaseId);
      } finally {
        for (const id of seededLeaseIds) await deleteSignedLease(api, id);
        for (const id of seededTemplateIds) await deleteTemplate(api, id);
        for (const id of seededApplicantIds) await deleteApplicant(api, id);
      }
    },
  );

  test(
    "generate lease button on lease templates list opens /leases/new?template_id=",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const seededTemplateIds: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E Template Entry ${runId}`,
        });
        seededTemplateIds.push(templateId);

        await page.goto("/lease-templates");
        await expect(
          page.getByRole("heading", { name: "Lease Templates" }),
        ).toBeVisible({ timeout: 10_000 });
        await page.waitForLoadState("networkidle");

        const generateBtn = page.getByTestId(
          `generate-lease-from-template-${templateId}`,
        );
        await expect(generateBtn).toBeVisible({ timeout: 10_000 });
        await generateBtn.click();

        await waitForLeaseNewPage(page);
        expect(page.url()).toContain(`template_id=${templateId}`);
      } finally {
        for (const id of seededTemplateIds) await deleteTemplate(api, id);
      }
    },
  );

  test(
    "generate lease button on applicant detail (stage=approved) opens /leases/new?applicant_id=",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const seededApplicantIds: string[] = [];

      try {
        const applicantId = await seedApplicant(api, {
          legal_name: `Approved Entry Tenant ${runId}`,
          stage: "approved",
        });
        seededApplicantIds.push(applicantId);

        await page.goto(`/applicants/${applicantId}`);
        await page.waitForLoadState("networkidle");

        const generateBtn = page.getByTestId("generate-lease-from-applicant");
        await expect(generateBtn).toBeVisible({ timeout: 10_000 });
        await generateBtn.click();

        await waitForLeaseNewPage(page);
        expect(page.url()).toContain(`applicant_id=${applicantId}`);
      } finally {
        for (const id of seededApplicantIds) await deleteApplicant(api, id);
      }
    },
  );
});
