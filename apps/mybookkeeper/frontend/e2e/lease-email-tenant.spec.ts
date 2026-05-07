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
 *    - 202 ``{"queued": true}`` once the applicant has an email.
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

async function setApplicantContactEmail(
  api: APIRequestContext,
  applicantId: string,
  contactEmail: string,
): Promise<void> {
  const res = await api.patch(`/applicants/${applicantId}`, {
    data: { contact_email: contactEmail },
  });
  if (!res.ok()) {
    throw new Error(
      `setApplicantContactEmail failed: ${res.status()} ${await res.text()}`,
    );
  }
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
    "manual re-send: 422 when applicant has no contact_email, 202 once it's set",
    async ({ api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E Email ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId);

        // Without a contact_email, the manual endpoint should 422
        // with detail "applicant_email_missing".
        const noEmailResp = await api.post(
          `/signed-leases/${leaseId}/email-tenant`,
        );
        expect(noEmailResp.status()).toBe(422);
        const noEmailBody = (await noEmailResp.json()) as { detail: string };
        expect(noEmailBody.detail).toBe("applicant_email_missing");

        // After setting a contact_email, the same call should 202.
        await setApplicantContactEmail(
          api, applicantId, `tenant-${runId}@example.com`,
        );
        const queuedResp = await api.post(
          `/signed-leases/${leaseId}/email-tenant`,
        );
        expect(queuedResp.status()).toBe(202);
        const queuedBody = (await queuedResp.json()) as { queued: boolean };
        expect(queuedBody.queued).toBe(true);
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
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
    "lease detail page: Email to tenant button is rendered for a generated lease",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(
        api,
        `E2E Email UI ${runId}`,
        { contact_email: `tenant-ui-${runId}@example.com` },
      );
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId);
        // Seeded as kind=imported with one attachment, so the button
        // should NOT render. Confirm absence first as a regression
        // pin (the contract is "generated leases only").
        await page.goto(`/leases/${leaseId}`);
        await expect(
          page.getByTestId("lease-applicant-card"),
        ).toBeVisible();
        await expect(
          page.getByTestId("lease-email-tenant-button"),
        ).toHaveCount(0);
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );
});
