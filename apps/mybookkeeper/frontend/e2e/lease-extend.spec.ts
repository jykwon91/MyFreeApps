import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * E2E tests for the lease extension feature (PR mbk-lease-extend-ui).
 *
 * Covers:
 * 1. Backend smoke: POST /signed-leases/{id}/extend updates ends_on, creates
 *    a signed_addendum attachment, returns the updated lease.
 * 2. Frontend UI: Extend button on a signed lease detail page opens a dialog,
 *    submitting it persists the new end date.
 * 3. Frontend UI: Extend button is HIDDEN for a draft lease (status guard).
 */

async function seedApplicant(
  api: APIRequestContext,
  legalName: string,
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { legal_name: legalName, stage: "lease_signed" },
  });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function seedSignedLease(
  api: APIRequestContext,
  applicantId: string,
  opts: {
    status?: string;
    starts_on?: string;
    ends_on?: string;
  } = {},
): Promise<string> {
  const res = await api.post("/test/seed-signed-lease", {
    data: {
      applicant_id: applicantId,
      kind: "imported",
      status: opts.status ?? "signed",
      starts_on: opts.starts_on ?? "2026-01-01",
      ends_on: opts.ends_on ?? "2026-12-31",
    },
  });
  if (!res.ok()) {
    throw new Error(
      `seedSignedLease failed: ${res.status()} ${await res.text()}`,
    );
  }
  return ((await res.json()) as { id: string }).id;
}

async function getLease(
  api: APIRequestContext,
  id: string,
): Promise<{
  ends_on: string | null;
  attachments: Array<{ kind: string; filename: string }>;
}> {
  const res = await api.get(`/signed-leases/${id}`);
  if (!res.ok()) throw new Error(`getLease failed: ${res.status()}`);
  return res.json() as Promise<{
    ends_on: string | null;
    attachments: Array<{ kind: string; filename: string }>;
  }>;
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


test.describe("Lease extension", () => {
  test(
    "API: POST /signed-leases/{id}/extend updates ends_on + creates addendum",
    async ({ api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E Extend ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId, {
          status: "signed",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
        });

        const res = await api.post(`/signed-leases/${leaseId}/extend`, {
          data: { new_ends_on: "2027-06-30", notes: "E2E extension" },
        });
        expect(res.status()).toBe(200);
        const body = (await res.json()) as { ends_on: string };
        expect(body.ends_on).toBe("2027-06-30");

        const fetched = await getLease(api, leaseId);
        expect(fetched.ends_on).toBe("2027-06-30");
        const addendum = fetched.attachments.find(
          (a) => a.kind === "signed_addendum",
        );
        expect(addendum).toBeDefined();
        expect(addendum?.filename).toContain("2027-06-30");
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );

  test(
    "API: rejects extension when new_ends_on is on or before current",
    async ({ api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E Bad Date ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId, {
          status: "signed",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
        });

        const res = await api.post(`/signed-leases/${leaseId}/extend`, {
          data: { new_ends_on: "2026-12-31" },
        });
        expect(res.status()).toBe(409);
        const body = (await res.json()) as {
          detail: { code: string; message: string };
        };
        expect(body.detail.code).toBe("NEW_END_DATE_NOT_AFTER_CURRENT");
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );

  test(
    "UI: Extend button on signed lease opens dialog and persists new date",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E UI Extend ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId, {
          status: "signed",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
        });

        await page.goto(`/leases/${leaseId}`);
        await page.waitForLoadState("networkidle");

        const extendButton = page.getByTestId("lease-extend-button");
        await expect(extendButton).toBeVisible({ timeout: 10000 });
        await extendButton.click();

        await expect(page.getByTestId("extend-lease-dialog")).toBeVisible();
        await page
          .getByTestId("extend-lease-new-end")
          .fill("2027-06-30");
        await page
          .getByTestId("extend-lease-notes")
          .fill("Six-month renewal");
        await page.getByTestId("extend-lease-confirm").click();

        // Wait for the mutation + cache invalidation to settle.
        await page.waitForLoadState("networkidle");

        const updated = await getLease(api, leaseId);
        expect(updated.ends_on).toBe("2027-06-30");
        expect(
          updated.attachments.some((a) => a.kind === "signed_addendum"),
        ).toBe(true);
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );

  test(
    "UI: Extend button is hidden for a draft lease",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E No Extend ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId, {
          status: "draft",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
        });

        await page.goto(`/leases/${leaseId}`);
        await page.waitForLoadState("networkidle");

        await expect(page.getByTestId("lease-extend-button")).toHaveCount(0);
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );
});
