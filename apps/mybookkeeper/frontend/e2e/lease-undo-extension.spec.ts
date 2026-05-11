import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * E2E for the 30-day extension undo flow.
 *
 * Backend extension service in #560, frontend Extend button in #561, this
 * PR adds the Undo button gated by the 30-day window.
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
): Promise<string> {
  const res = await api.post("/test/seed-signed-lease", {
    data: {
      applicant_id: applicantId,
      kind: "imported",
      status: "signed",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
    },
  });
  if (!res.ok()) {
    throw new Error(
      `seedSignedLease failed: ${res.status()} ${await res.text()}`,
    );
  }
  return ((await res.json()) as { id: string }).id;
}

async function extendLease(
  api: APIRequestContext,
  leaseId: string,
  newEndsOn: string,
): Promise<{ versionId: string }> {
  const res = await api.post(`/signed-leases/${leaseId}/extend`, {
    data: { new_ends_on: newEndsOn },
  });
  if (!res.ok()) {
    throw new Error(`extendLease failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    latest_extension: { id: string } | null;
  };
  if (!body.latest_extension) {
    throw new Error("extendLease: no latest_extension on response");
  }
  return { versionId: body.latest_extension.id };
}

async function getLease(
  api: APIRequestContext,
  id: string,
): Promise<{
  ends_on: string | null;
  latest_extension: { id: string } | null;
}> {
  const res = await api.get(`/signed-leases/${id}`);
  if (!res.ok()) throw new Error(`getLease failed: ${res.status()}`);
  return res.json() as Promise<{
    ends_on: string | null;
    latest_extension: { id: string } | null;
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


test.describe("Lease extension undo", () => {
  test(
    "API: POST .../extensions/{id}/undo rolls back ends_on",
    async ({ api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E Undo ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId);
        const { versionId } = await extendLease(api, leaseId, "2027-06-30");

        const undoRes = await api.post(
          `/signed-leases/${leaseId}/extensions/${versionId}/undo`,
        );
        expect(undoRes.status()).toBe(200);
        const body = (await undoRes.json()) as {
          ends_on: string;
          latest_extension: unknown;
        };
        expect(body.ends_on).toBe("2026-12-31");
        expect(body.latest_extension).toBeNull();

        const fetched = await getLease(api, leaseId);
        expect(fetched.ends_on).toBe("2026-12-31");
        expect(fetched.latest_extension).toBeNull();
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );

  test(
    "API: undoing the same extension twice returns 404",
    async ({ api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E Undo Twice ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId);
        const { versionId } = await extendLease(api, leaseId, "2027-06-30");

        const first = await api.post(
          `/signed-leases/${leaseId}/extensions/${versionId}/undo`,
        );
        expect(first.status()).toBe(200);

        const second = await api.post(
          `/signed-leases/${leaseId}/extensions/${versionId}/undo`,
        );
        // After undo, the version is soft-deleted → not in the live set
        // → 404 (route maps ExtensionNotFoundError).
        expect(second.status()).toBe(404);
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );

  test(
    "UI: Undo button on an extended lease rolls back ends_on",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E Undo UI ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId);
        await extendLease(api, leaseId, "2027-06-30");

        await page.goto(`/leases/${leaseId}`);
        await page.waitForLoadState("networkidle");

        const undoButton = page.getByTestId("lease-undo-extension-button");
        await expect(undoButton).toBeVisible({ timeout: 10000 });
        await undoButton.click();

        await expect(
          page.getByTestId("undo-extension-dialog"),
        ).toBeVisible();
        await page.getByTestId("undo-extension-confirm").click();

        await page.waitForLoadState("networkidle");

        const fetched = await getLease(api, leaseId);
        expect(fetched.ends_on).toBe("2026-12-31");
        expect(fetched.latest_extension).toBeNull();
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );

  test(
    "UI: Undo button is hidden on a lease with no extension",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const applicantId = await seedApplicant(api, `E2E No Undo ${runId}`);
      let leaseId = "";
      try {
        leaseId = await seedSignedLease(api, applicantId);
        await page.goto(`/leases/${leaseId}`);
        await page.waitForLoadState("networkidle");

        await expect(
          page.getByTestId("lease-undo-extension-button"),
        ).toHaveCount(0);
      } finally {
        if (leaseId) await deleteSignedLease(api, leaseId);
        await deleteApplicant(api, applicantId);
      }
    },
  );
});
