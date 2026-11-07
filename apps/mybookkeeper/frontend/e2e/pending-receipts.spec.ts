import { test, expect } from "./fixtures/auth";
import { deleteInquiry } from "./fixtures/inquiries";
import { localToday } from "./fixtures/local-today";
import { deleteApplicant } from "./fixtures/applicants";

/**
 * Behavioral E2E tests for the rent-receipt send chain.
 *
 * Each test creates real data via the seed API, performs the user action,
 * asserts the outcome via the API, and cleans up.
 *
 * Replaces the layout-only suite from PR #215 which only checked element
 * visibility with mocked API responses.
 *
 * Four scenarios:
 *   A. Seed payment → open /receipts → click "Review & send" → Send → assert
 *      Gmail stub captured the send + lease attachment created.
 *   B. Same flow as A but verifies the pending-receipts list entry disappears
 *      after the receipt is marked sent.
 *   C. Gmail reauth gating: Send is off until Gmail is reconnected, and a
 *      send already open when Gmail drops says to reconnect.
 *   D. A send stuck on a Gmail account that isn't connected any more: the
 *      row names the account and Dismiss works after confirming.
 */

// ---------------------------------------------------------------------------
// Seed / cleanup helpers
// ---------------------------------------------------------------------------

interface SeedRentPaymentPayload {
  tenant_legal_name: string;
  tenant_email: string;
  amount_cents: number;
  payer_name?: string;
}

interface SeedRentPaymentResult {
  applicant_id: string;
  inquiry_id: string;
  signed_lease_id: string;
  transaction_id: string;
}

async function seedRentPayment(
  api: import("@playwright/test").APIRequestContext,
  payload: SeedRentPaymentPayload,
): Promise<SeedRentPaymentResult> {
  const res = await api.post("/test/seed-rent-payment-attributed", {
    data: payload,
  });
  if (!res.ok()) {
    throw new Error(`seedRentPayment failed: ${res.status()} ${await res.text()}`);
  }
  return res.json() as Promise<SeedRentPaymentResult>;
}

async function cleanupRentPayment(
  api: import("@playwright/test").APIRequestContext,
  seed: SeedRentPaymentResult,
): Promise<void> {
  // The signed lease goes first: it cascades its attachments and pending
  // receipts, and its applicant FK is RESTRICT. The inquiry is deleted
  // separately so the email address is gone too. The transaction's
  // applicant_id goes to NULL via ON DELETE SET NULL.
  const lease = await api.delete(`/test/signed-leases/${seed.signed_lease_id}`);
  if (!lease.ok()) throw new Error(`delete signed lease failed: ${lease.status()} ${await lease.text()}`);
  await deleteApplicant(api, seed.applicant_id);
  await deleteInquiry(api, seed.inquiry_id);
}

async function seedGmailIntegration(
  api: import("@playwright/test").APIRequestContext,
  opts: { hasSendScope: boolean } = { hasSendScope: true },
): Promise<void> {
  const res = await api.post("/test/seed-gmail-integration", {
    data: { has_send_scope: opts.hasSendScope },
  });
  if (!res.ok()) {
    throw new Error(`seedGmailIntegration failed: ${res.status()} ${await res.text()}`);
  }
}

async function removeGmailIntegration(
  api: import("@playwright/test").APIRequestContext,
): Promise<void> {
  await api.delete("/test/seed-gmail-integration").catch(() => {});
}

async function enableMockGmailSend(
  api: import("@playwright/test").APIRequestContext,
): Promise<void> {
  const res = await api.post("/test/mock-gmail-send/enable");
  if (!res.ok()) {
    throw new Error(`enableMockGmailSend failed: ${res.status()} ${await res.text()}`);
  }
}

async function disableMockGmailSend(
  api: import("@playwright/test").APIRequestContext,
): Promise<void> {
  await api.post("/test/mock-gmail-send/disable").catch(() => {});
}

async function setGmailReauthState(
  api: import("@playwright/test").APIRequestContext,
  needsReauth: boolean,
): Promise<void> {
  const res = await api.post("/test/seed-integration-reauth-state", {
    data: { needs_reauth: needsReauth },
  });
  if (!res.ok()) {
    throw new Error(`setGmailReauthState failed: ${res.status()} ${await res.text()}`);
  }
}

interface LastGmailSendResult {
  captured: boolean;
  to_address?: string;
  subject?: string;
  has_attachment?: boolean;
  attachment_filename?: string;
}

async function getLastGmailSend(
  api: import("@playwright/test").APIRequestContext,
): Promise<LastGmailSendResult> {
  const res = await api.get("/test/last-gmail-send");
  if (!res.ok()) {
    throw new Error(`getLastGmailSend failed: ${res.status()} ${await res.text()}`);
  }
  return res.json() as Promise<LastGmailSendResult>;
}

interface LeaseAttachment {
  id: string;
  kind: string;
  filename: string;
}

async function getLeaseAttachments(
  api: import("@playwright/test").APIRequestContext,
  leaseId: string,
): Promise<LeaseAttachment[]> {
  const res = await api.get(`/signed-leases/${leaseId}/attachments`);
  if (!res.ok()) return [];
  const data = await res.json() as LeaseAttachment[] | { items?: LeaseAttachment[] };
  // The endpoint returns a plain array, not a paginated envelope.
  return Array.isArray(data) ? data : (data.items ?? []);
}

// ---------------------------------------------------------------------------
// Test A — Send from Pending Receipts page: receipt email dispatched + lease
//           attachment created
// ---------------------------------------------------------------------------

// Serial execution is required because all three tests share process-level
// state (the mock Gmail ring buffer and the org's Gmail integration row).
// Parallel runs would stomp on each other's integration state mid-test.
test.describe.serial("Pending Receipts — behavioral: send receipt chain", () => {
  test("A: send receipt → Gmail stub captures send, lease gets rent_receipt attachment", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seed = await seedRentPayment(api, {
      tenant_legal_name: `E2E Tenant ${runId}`,
      tenant_email: `e2e-receipt-${runId}@example.com`,
      amount_cents: 150000,
      payer_name: `E2E Tenant ${runId}`,
    });

    try {
      await seedGmailIntegration(api, { hasSendScope: true });
      await enableMockGmailSend(api);

      // Navigate to pending receipts page and find the row.
      await page.goto("/receipts");
      await expect(
        page.getByTestId("pending-receipt-row").first(),
      ).toBeVisible({ timeout: 15000 });

      // Open the send dialog for our seeded row.
      // Use the row that matches our payer name.
      const row = page.getByText(`E2E Tenant ${runId}`).first();
      await expect(row).toBeVisible({ timeout: 10000 });
      // Click the "Review & send" button in the same row container.
      const sendBtn = page
        .locator('[data-testid="pending-receipt-row"]')
        .filter({ hasText: `E2E Tenant ${runId}` })
        .getByTestId("pending-receipt-send-btn");
      await sendBtn.click();

      // Dialog opens with pre-filled period dates.
      await expect(page.getByTestId("send-receipt-dialog")).toBeVisible({ timeout: 5000 });
      const periodStart = await page.getByTestId("receipt-period-start").inputValue();
      expect(periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Preview is dated with the host's day too, and the PDF shows.
      const previewResponse = page.waitForResponse((r) =>
        r.url().includes(`/api/rent-receipts/preview/${seed.transaction_id}`),
      );
      await page.getByTestId("receipt-preview-btn").click();
      const preview = await previewResponse;
      expect(preview.ok()).toBeTruthy();
      expect(preview.headers()["content-type"]).toContain("application/pdf");
      expect(new URL(preview.url()).searchParams.get("today")).toBe(localToday());
      await expect(page.getByTestId("receipt-preview-iframe")).toBeVisible();

      // Click Send and wait for the response.
      const sendResponse = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/rent-receipts/${seed.transaction_id}/send`) &&
          r.request().method() === "POST",
      );
      await page.getByTestId("receipt-send-btn").click();
      const resp = await sendResponse;
      expect(resp.ok()).toBeTruthy();
      expect(resp.request().postDataJSON().today).toBe(localToday());

      // Dialog should close on success.
      await expect(page.getByTestId("send-receipt-dialog")).not.toBeVisible({ timeout: 5000 });

      // Assert Gmail mock captured the send with correct recipient.
      const gmailCapture = await getLastGmailSend(api);
      expect(gmailCapture.captured).toBe(true);
      expect(gmailCapture.to_address).toBe(`e2e-receipt-${runId}@example.com`);
      expect(gmailCapture.subject).toContain("Rent receipt");
      expect(gmailCapture.has_attachment).toBe(true);
      expect(gmailCapture.attachment_filename).toMatch(/^receipt-R-/);

      // Assert a rent_receipt attachment was saved to the signed lease.
      const attachments = await getLeaseAttachments(api, seed.signed_lease_id);
      const receiptAttachment = attachments.find((a) => a.kind === "rent_receipt");
      expect(receiptAttachment).toBeDefined();
      expect(receiptAttachment?.filename).toMatch(/^receipt-R-/);
    } finally {
      await disableMockGmailSend(api);
      await removeGmailIntegration(api);
      await cleanupRentPayment(api, seed);
    }
  });

  // -------------------------------------------------------------------------
  // Test B — After sending, the pending row is marked sent (disappears from
  //           the pending list)
  // -------------------------------------------------------------------------

  test("B: after send, pending receipt row is removed from the pending list", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seed = await seedRentPayment(api, {
      tenant_legal_name: `E2E Tenant B ${runId}`,
      tenant_email: `e2e-receipt-b-${runId}@example.com`,
      amount_cents: 120000,
    });

    try {
      await seedGmailIntegration(api, { hasSendScope: true });
      await enableMockGmailSend(api);

      // Verify the pending row appears via the API before navigating.
      const pendingRes = await api.get("/rent-receipts/pending");
      expect(pendingRes.ok()).toBeTruthy();
      const pendingData = await pendingRes.json() as { items: { transaction_id: string }[] };
      const pendingRow = pendingData.items.find(
        (item) => item.transaction_id === seed.transaction_id,
      );
      expect(pendingRow).toBeDefined();

      // Navigate and send.
      await page.goto("/receipts");
      await expect(
        page.locator('[data-testid="pending-receipt-row"]').filter({
          hasText: `E2E Tenant B ${runId}`,
        }),
      ).toBeVisible({ timeout: 15000 });

      await page
        .locator('[data-testid="pending-receipt-row"]')
        .filter({ hasText: `E2E Tenant B ${runId}` })
        .getByTestId("pending-receipt-send-btn")
        .click();

      await expect(page.getByTestId("send-receipt-dialog")).toBeVisible({ timeout: 5000 });

      const sendResponse = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/rent-receipts/${seed.transaction_id}/send`) &&
          r.request().method() === "POST",
      );
      await page.getByTestId("receipt-send-btn").click();
      await sendResponse;

      // After sending, our row should disappear from the pending list.
      await expect(
        page.locator('[data-testid="pending-receipt-row"]').filter({
          hasText: `E2E Tenant B ${runId}`,
        }),
      ).not.toBeVisible({ timeout: 10000 });

      // Confirm via API that the receipt is now in "sent" state.
      const afterRes = await api.get("/rent-receipts/pending");
      expect(afterRes.ok()).toBeTruthy();
      const afterData = await afterRes.json() as { items: { transaction_id: string }[] };
      const stillPending = afterData.items.find(
        (item) => item.transaction_id === seed.transaction_id,
      );
      expect(stillPending).toBeUndefined();
    } finally {
      await disableMockGmailSend(api);
      await removeGmailIntegration(api);
      await cleanupRentPayment(api, seed);
    }
  });

  // -------------------------------------------------------------------------
  // Test C — Gmail reauth gating: the list turns Send off and says to
  //           reconnect; a send already open when Gmail drops says so too
  // -------------------------------------------------------------------------

  test("C: Gmail needing reconnection turns Send off, and a send already open says to reconnect", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const tenant = `E2E Tenant C ${runId}`;
    const seed = await seedRentPayment(api, {
      tenant_legal_name: tenant,
      tenant_email: `e2e-receipt-c-${runId}@example.com`,
      amount_cents: 90000,
    });
    const row = page.locator('[data-testid="pending-receipt-row"]').filter({ hasText: tenant });

    try {
      await seedGmailIntegration(api, { hasSendScope: true });
      await setGmailReauthState(api, true);

      await page.goto("/receipts");
      await expect(row).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("pending-receipts-gmail-state")).toHaveText("Gmail needs to be reconnected before I can send.");
      await expect(page.getByRole("link", { name: "Open Integrations" })).toHaveAttribute("href", "/integrations");
      await expect(row.getByTestId("pending-receipt-send-btn")).toBeDisabled();

      // Reconnected: Send comes back.
      await setGmailReauthState(api, false);
      await page.reload();
      await expect(row.getByTestId("pending-receipt-send-btn")).toBeEnabled({ timeout: 15000 });
      await row.getByTestId("pending-receipt-send-btn").click();
      await expect(page.getByTestId("send-receipt-dialog")).toBeVisible({ timeout: 5000 });

      // Gmail drops while the dialog is open: the server refuses with 503.
      await setGmailReauthState(api, true);
      const sendResponse = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/rent-receipts/${seed.transaction_id}/send`) &&
          r.request().method() === "POST",
      );
      await page.getByTestId("receipt-send-btn").click();
      expect((await sendResponse).status()).toBe(503);

      await expect(page.getByText(/Go to Integrations → Reconnect Gmail/)).toBeVisible({ timeout: 5000 });
      // Nothing went, so the dialog stays open to cancel or retry.
      await expect(page.getByTestId("send-receipt-dialog")).toBeVisible();
    } finally {
      // Reset reauth state before cleanup so the integration deletion succeeds.
      await setGmailReauthState(api, false).catch(() => {});
      await removeGmailIntegration(api);
      await cleanupRentPayment(api, seed);
    }
  });

  // -------------------------------------------------------------------------
  // Test D — A send stuck on a Gmail account that isn't connected any more
  //           can't be checked, so the row names it and lets me dismiss it
  // -------------------------------------------------------------------------

  test("D: send stuck on another Gmail account → row names it, Dismiss after confirming", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seed = await seedRentPayment(api, {
      tenant_legal_name: `E2E Tenant D ${runId}`,
      tenant_email: `e2e-receipt-d-${runId}@example.com`,
      amount_cents: 110000,
    });

    try {
      await seedGmailIntegration(api, { hasSendScope: true });
      const stuck = await api.post("/test/seed-receipt-stuck-send", {
        data: { transaction_id: seed.transaction_id, sender_gmail_address: "old-host@example.com" },
      });
      expect(stuck.ok()).toBeTruthy();

      await page.goto("/receipts");
      const row = page
        .locator('[data-testid="pending-receipt-row"]')
        .filter({ hasText: `E2E Tenant D ${runId}` });
      await expect(row).toBeVisible({ timeout: 15000 });
      await expect(row.getByTestId("pending-receipt-other-gmail-note")).toContainText("old-host@example.com");
      await expect(row.getByTestId("pending-receipt-send-btn")).toHaveCount(0);

      await row.getByTestId("pending-receipt-dismiss-btn").click();
      const confirm = page.getByRole("dialog", { name: "Dismiss this receipt?" });
      await expect(confirm).toBeVisible();
      const dismissResponse = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/rent-receipts/${seed.transaction_id}/dismiss`) &&
          r.request().method() === "POST",
      );
      await confirm.getByRole("button", { name: "Dismiss" }).click();
      expect((await dismissResponse).ok()).toBeTruthy();

      await expect(row).not.toBeVisible({ timeout: 10000 });
      const afterRes = await api.get("/rent-receipts/pending");
      const afterData = await afterRes.json() as { items: { transaction_id: string }[] };
      expect(afterData.items.find((item) => item.transaction_id === seed.transaction_id)).toBeUndefined();
    } finally {
      await removeGmailIntegration(api);
      await cleanupRentPayment(api, seed);
    }
  });
});
