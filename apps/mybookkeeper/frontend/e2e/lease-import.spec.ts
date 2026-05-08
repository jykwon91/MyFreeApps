import path from "path";
import { fileURLToPath } from "url";
import { test, expect, type APIRequestContext } from "./fixtures/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Import Signed Lease (Phase 1.5) — primary user flows.
 *
 * Tests the "Import signed lease" path that creates a signed_lease record
 * with kind='imported' without going through the generate-from-template flow.
 *
 * Test 1: Seeds a lease via the test API (bypasses MinIO), then verifies the
 *         lease detail page shows the correct kind badge and files tab.
 *
 * Test 2: Exercises the import dialog UI — verifies submit is disabled until
 *         both an applicant and a file are provided.
 *
 * Test 3: Full happy path — submits the import dialog and asserts navigation
 *         to the new lease detail page. Requires MinIO to be reachable;
 *         skips with a clear message if not (start it with
 *         `docker compose -f infra/docker-compose.yml up -d minio`).
 */

async function isMinioReachable(api: APIRequestContext): Promise<boolean> {
  try {
    const res = await api.get("/admin/storage-health");
    if (!res.ok()) return false;
    const body = (await res.json()) as { bucket_reachable: boolean | null };
    return body.bucket_reachable === true;
  } catch {
    return false;
  }
}

async function seedApplicant(
  api: APIRequestContext,
  legalName: string,
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { legal_name: legalName, stage: "lead" },
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
): Promise<{ id: string; attachment_id: string }> {
  const res = await api.post("/test/seed-signed-lease", {
    data: { applicant_id: applicantId, kind: "imported", status: "signed" },
  });
  if (!res.ok()) {
    throw new Error(`seedSignedLease failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; attachment_id: string };
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function deleteSignedLease(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/signed-leases/${id}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Import Signed Lease", () => {
  test(
    "seeded imported lease shows kind=Imported badge and attachment on detail page",
    async ({ authedPage: page, api }) => {
      const runId = Date.now();
      const applicantName = `E2E Import Lease ${runId}`;
      const seededApplicantIds: string[] = [];
      const seededLeaseIds: string[] = [];

      try {
        // Seed applicant + imported lease directly via API (bypasses MinIO).
        const applicantId = await seedApplicant(api, applicantName);
        seededApplicantIds.push(applicantId);

        const { id: leaseId } = await seedSignedLease(api, applicantId);
        seededLeaseIds.push(leaseId);

        // Navigate directly to the lease detail page.
        await page.goto(`/leases/${leaseId}`);
        await page.waitForLoadState("networkidle");

        // Verify the kind badge shows "Imported".
        const kindBadgeWrapper = page.getByTestId("lease-kind-badge");
        await expect(kindBadgeWrapper).toBeVisible({ timeout: 10000 });
        await expect(kindBadgeWrapper).toContainText("Imported");

        // Verify the files tab shows the seeded attachment.
        const filesTab = page.getByTestId("lease-tab-files");
        await filesTab.click();
        await page.waitForLoadState("networkidle");

        // Count attachment rows (exclude kind-select and dropzone which share the prefix).
        const attachments = page.locator(
          "[data-testid^='lease-attachment-']:not([data-testid='lease-attachment-kind-select']):not([data-testid='lease-attachment-dropzone'])",
        );
        await expect(attachments).toHaveCount(1, { timeout: 10000 });

        // Verify via API that kind is "imported".
        const leaseRes = await api.get(`/signed-leases/${leaseId}`);
        expect(leaseRes.ok()).toBe(true);
        const leaseBody = (await leaseRes.json()) as {
          kind: string;
          status: string;
          template_id: string | null;
          attachments: Array<{ kind: string }>;
        };
        expect(leaseBody.kind).toBe("imported");
        expect(leaseBody.status).toBe("signed");
        expect(leaseBody.template_id).toBeNull();
        expect(leaseBody.attachments[0].kind).toBe("signed_lease");
      } finally {
        for (const id of seededLeaseIds) {
          await deleteSignedLease(api, id);
        }
        for (const id of seededApplicantIds) {
          await deleteApplicant(api, id);
        }
      }
    },
  );

  test(
    "import dialog — submit is disabled until applicant and file are both provided",
    async ({ authedPage: page }) => {
      await page.goto("/leases");
      await expect(
        page.getByRole("heading", { name: "Leases" }),
      ).toBeVisible({ timeout: 10000 });
      await page.waitForLoadState("networkidle");

      const importBtn = page.getByTestId("import-signed-lease-button");
      await importBtn.click();

      const dialog = page.getByTestId("lease-import-dialog");
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const submitBtn = page.getByTestId("import-submit");
      // No applicant selected + no file → should be disabled.
      await expect(submitBtn).toBeDisabled();

      // Cancel dismisses dialog.
      await page.getByTestId("import-cancel").click();
      await expect(dialog).not.toBeVisible();
    },
  );

  test(
    "import dialog — full upload happy path navigates to lease detail",
    async ({ authedPage: page, api }) => {
      // The import endpoint requires MinIO. Skip cleanly with a clear
      // remediation message if storage isn't reachable, instead of
      // silently passing on an error toast.
      const minioUp = await isMinioReachable(api);
      test.skip(
        !minioUp,
        "MinIO is not reachable — start it with `docker compose -f infra/docker-compose.yml up -d minio` and re-run.",
      );

      const runId = Date.now();
      const applicantName = `E2E Dialog Submit ${runId}`;
      const seededApplicantIds: string[] = [];
      const seededLeaseIds: string[] = [];

      try {
        const applicantId = await seedApplicant(api, applicantName);
        seededApplicantIds.push(applicantId);

        await page.goto("/leases");
        await expect(
          page.getByRole("heading", { name: "Leases" }),
        ).toBeVisible({ timeout: 10000 });
        await page.waitForLoadState("networkidle");

        // Open dialog.
        await page.getByTestId("import-signed-lease-button").click();
        const dialog = page.getByTestId("lease-import-dialog");
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Select applicant.
        const applicantSelect = page.getByTestId("import-applicant-select");
        await applicantSelect.selectOption({ label: applicantName });

        // Upload a PDF.
        const pdfFixture = path.join(
          __dirname,
          "fixtures",
          "documents",
          "advertising-invoice.pdf",
        );
        const fileInput = page.getByTestId("import-file-input");
        await fileInput.setInputFiles(pdfFixture);

        // File chip should appear.
        await expect(page.getByTestId("import-file-list")).toBeVisible();

        // Submit button should now be enabled.
        const submitBtn = page.getByTestId("import-submit");
        await expect(submitBtn).not.toBeDisabled();

        // Click submit — with MinIO reachable, the upload + DB insert
        // succeeds and the page navigates to the new lease's detail page.
        await submitBtn.click();

        await page.waitForURL(/\/leases\/[0-9a-f-]{36}$/, { timeout: 15000 });
        const leaseId = page.url().split("/leases/")[1];
        if (leaseId) seededLeaseIds.push(leaseId);

        // Sanity check: detail page rendered the imported lease.
        const kindBadge = page.getByTestId("lease-kind-badge");
        await expect(kindBadge).toBeVisible({ timeout: 10000 });
        await expect(kindBadge).toContainText("Imported");
      } finally {
        for (const id of seededLeaseIds) {
          await deleteSignedLease(api, id);
        }
        for (const id of seededApplicantIds) {
          await deleteApplicant(api, id);
        }
      }
    },
  );
});
