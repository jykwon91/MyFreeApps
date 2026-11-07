import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * E2E tests for the auto-email-tenant-on-generate feature + manual
 * re-send endpoint.
 *
 * Two layers covered:
 *
 * 1. Backend API: ``POST /signed-leases/{id}/email-tenant`` — manual
 *    queue endpoint. Asserts:
 *    - 422 ``"applicant_email_missing"`` when contact_email isn't set
 *      on the applicant.
 *    - 202 ``{"queued": true}`` when the applicant has an email.
 *    - 404 for a lease that doesn't exist.
 *
 * 2. Frontend UI: the "Email to tenant" button is rendered on the
 *    lease detail page and reflects the disabled / enabled state
 *    based on the applicant's contact_email. (Click-and-toast flow is
 *    covered by the Vitest unit test ``LeaseDetailEmailButton.test.tsx``;
 *    this E2E only verifies the button is wired to the right
 *    applicant.)
 */

async function seedApplicant(
  api: APIRequestContext,
  legalName: string,
  extras: Record<string, unknown> = {},
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { legal_name: legalName, stage: "lead", ...extras },
  });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function seedSignedLease(
  api: APIRequestContext,
  applicantId: string,
): Promise<string> {
  const res = await api.post("/test/seed-signed-lease", {
    data: { applicant_id: applicantId, kind: "imported", status: "signed" },
  });
  if (!res.ok()) {
    throw new Error(`seedSignedLease failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteApplicant(
  api: APIRequestContext, id: string,
): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function deleteSignedLease(
  api: APIRequestContext, id: string,
): Promise<void> {
  await api.delete(`/test/signed-leases/${id}`).catch(() => {});
}


test.describe("Lease — Email to tenant", () => {
  test(
    "manual re-send: 422 when applicant has no contact_email, 202 when it has one",
    async ({ api }) => {
      const runId = Date.now();
      let noEmailId = "";
      let withEmailId = "";
      let noEmailLeaseId = "";
      let withEmailLeaseId = "";
      try {
        noEmailId = await seedApplicant(api, `E2E No Email ${runId}`);
        withEmailId = await seedApplicant(
          api,
          `E2E Email ${runId}`,
          { contact_email: `tenant-${runId}@example.com` },
        );
        noEmailLeaseId = await seedSignedLease(api, noEmailId);
        withEmailLeaseId = await seedSignedLease(api, withEmailId);

        // Without a contact_email, the manual endpoint should 422
        // with detail "applicant_email_missing".
        const noEmailResp = await api.post(
          `/signed-leases/${noEmailLeaseId}/email-tenant`,
        );
        expect(noEmailResp.status()).toBe(422);
        const noEmailBody = (await noEmailResp.json()) as { detail: string };
        expect(noEmailBody.detail).toBe("applicant_email_missing");

        // With a contact_email on file, the same call should 202.
        const queuedResp = await api.post(
          `/signed-leases/${withEmailLeaseId}/email-tenant`,
        );
        expect(queuedResp.status()).toBe(202);
        const queuedBody = (await queuedResp.json()) as { queued: boolean };
        expect(queuedBody.queued).toBe(true);
      } finally {
        if (noEmailLeaseId) await deleteSignedLease(api, noEmailLeaseId);
        if (withEmailLeaseId) await deleteSignedLease(api, withEmailLeaseId);
        if (noEmailId) await deleteApplicant(api, noEmailId);
        if (withEmailId) await deleteApplicant(api, withEmailId);
      }
    },
  );

  test(
    "manual re-send: 404 for a lease that doesn't exist",
    async ({ api }) => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const resp = await api.post(`/signed-leases/${fakeId}/email-tenant`);
      expect(resp.status()).toBe(404);
    },
  );

  test(
    "lease detail page: Email to tenant is enabled only when the tenant has an email",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      let withEmailId = "";
      let noEmailId = "";
      let withEmailLeaseId = "";
      let noEmailLeaseId = "";
      try {
        withEmailId = await seedApplicant(
          api,
          `E2E Email UI ${runId}`,
          { contact_email: `tenant-ui-${runId}@example.com` },
        );
        noEmailId = await seedApplicant(api, `E2E No Email UI ${runId}`);
        // Seeded as kind=imported with a signed_lease attachment. Since #434
        // any lease with an emailable attachment shows the button.
        withEmailLeaseId = await seedSignedLease(api, withEmailId);
        noEmailLeaseId = await seedSignedLease(api, noEmailId);

        await page.goto(`/leases/${withEmailLeaseId}`);
        await expect(page.getByTestId("lease-applicant-card")).toBeVisible();
        await expect(page.getByTestId("lease-email-tenant-button")).toBeEnabled();

        await page.goto(`/leases/${noEmailLeaseId}`);
        await expect(page.getByTestId("lease-applicant-card")).toBeVisible();
        await expect(page.getByTestId("lease-email-tenant-button")).toBeDisabled();
      } finally {
        if (withEmailLeaseId) await deleteSignedLease(api, withEmailLeaseId);
        if (noEmailLeaseId) await deleteSignedLease(api, noEmailLeaseId);
        if (withEmailId) await deleteApplicant(api, withEmailId);
        if (noEmailId) await deleteApplicant(api, noEmailId);
      }
    },
  );
});
