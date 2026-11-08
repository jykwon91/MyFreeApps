import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { deleteApplicant } from "./fixtures/applicants";
import { deleteSignedLease } from "./fixtures/signed-leases";
import { toasts } from "./fixtures/toasts";

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
 *         to the new lease detail page. Stores the file in MinIO, which the
 *         E2E stack runs.
 *
 * Test 4: A photo that can't be re-encoded without its location metadata is
 *         refused, and no lease is created.
 */

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
): Promise<{ id: string; attachment_ids: string[] }> {
  const res = await api.post("/test/seed-signed-lease", {
    data: { applicant_id: applicantId, kind: "imported", status: "signed" },
  });
  if (!res.ok()) {
    throw new Error(`seedSignedLease failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; attachment_ids: string[] };
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

        const { id: leaseId, attachment_ids: attachmentIds } = await seedSignedLease(api, applicantId);
        seededLeaseIds.push(leaseId);
        expect(attachmentIds).toHaveLength(1);
        const [attachmentId] = attachmentIds;

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

        // Each attachment is one <li> row; its buttons share the test-id prefix.
        await expect(page.getByTestId(`lease-attachment-${attachmentId}`)).toBeVisible({ timeout: 10000 });
        await expect(page.locator("li[data-testid^='lease-attachment-']")).toHaveCount(1);

        // Verify via API that kind is "imported".
        const leaseRes = await api.get(`/signed-leases/${leaseId}`);
        expect(leaseRes.ok()).toBe(true);
        const leaseBody = (await leaseRes.json()) as {
          kind: string;
          status: string;
          templates: Array<{ id: string; name: string }>;
          attachments: Array<{ id: string; kind: string }>;
        };
        expect(leaseBody.kind).toBe("imported");
        expect(leaseBody.status).toBe("signed");
        expect(leaseBody.templates).toEqual([]);
        expect(leaseBody.attachments).toHaveLength(1);
        expect(leaseBody.attachments[0].id).toBe(attachmentId);
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

        // The file reached storage: the lease's one attachment downloads as the
        // bytes that were uploaded.
        const leaseRes = await api.get(`/signed-leases/${leaseId}`);
        expect(leaseRes.status(), await leaseRes.text()).toBe(200);
        const lease = (await leaseRes.json()) as {
          kind: string;
          attachments: { filename: string; is_available: boolean; presigned_url: string | null }[];
        };
        expect(lease.kind).toBe("imported");
        expect(lease.attachments.map((a) => [a.filename, a.is_available])).toEqual([
          ["advertising-invoice.pdf", true],
        ]);
        const { presigned_url } = lease.attachments[0];
        if (!presigned_url) throw new Error("the imported attachment has no download URL");
        const download = await page.request.get(presigned_url);
        expect(download.status()).toBe(200);
        expect(Buffer.compare(await download.body(), fs.readFileSync(pdfFixture))).toBe(0);
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
    "import dialog — a photo that can't be cleaned of its location is refused and nothing is created",
    async ({ authedPage: page, api }) => {
      const applicantName = `E2E Import Broken Photo ${Date.now()}`;
      const applicantId = await seedApplicant(api, applicantName);

      try {
        await page.goto("/leases");
        await expect(page.getByRole("heading", { name: "Leases" })).toBeVisible({ timeout: 10000 });
        await page.waitForLoadState("networkidle");

        await page.getByTestId("import-signed-lease-button").click();
        const dialog = page.getByTestId("lease-import-dialog");
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await page.getByTestId("import-applicant-select").selectOption({ label: applicantName });

        // JPEG magic bytes on a body that isn't an image, labelled as a PDF:
        // the server reads the bytes, sees a photo, and can't re-encode it.
        await page.getByTestId("import-file-input").setInputFiles({
          name: "lease.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400, 0x4d)]),
        });
        const importResponse = page.waitForResponse(
          (res) => res.url().includes("/signed-leases/import") && res.request().method() === "POST",
        );
        await page.getByTestId("import-submit").click();

        expect((await importResponse).status()).toBe(415);
        await expect(
          toasts(page).getByText("Couldn't import the lease. Please check the files and try again."),
        ).toBeVisible({ timeout: 10000 });
        await expect(dialog).toBeVisible();
        await expect(page).toHaveURL(/\/leases$/);

        const res = await api.get(`/signed-leases?applicant_id=${applicantId}`);
        expect(res.status(), await res.text()).toBe(200);
        expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
      } finally {
        await deleteApplicant(api, applicantId);
      }
    },
  );
});
