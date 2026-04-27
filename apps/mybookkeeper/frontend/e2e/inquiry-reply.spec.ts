import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * PR 2.3 — Templated reply flow E2E.
 *
 * Covers the host-driven send path: open the reply panel, pick a template,
 * preview the rendered text, edit, send. Gmail is mocked via the test_utils
 * stub so the suite doesn't hit Google's API.
 *
 * Cleanup deletes seeded inquiries and removes the stub Gmail integration so
 * subsequent suites start with a clean slate per ``feedback_clean_test_data``.
 */

interface SeedInquiryPayload {
  source: "FF" | "TNH" | "direct" | "other";
  external_inquiry_id?: string | null;
  inquirer_name?: string | null;
  inquirer_email?: string | null;
  inquirer_employer?: string | null;
  desired_start_date?: string | null;
  desired_end_date?: string | null;
  received_at?: string;
}

async function seedInquiry(
  api: APIRequestContext,
  payload: SeedInquiryPayload,
): Promise<string> {
  const res = await api.post("/test/seed-inquiry", {
    data: { received_at: payload.received_at ?? new Date().toISOString(), ...payload },
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

async function seedGmailIntegration(
  api: APIRequestContext,
  opts: { hasSendScope: boolean } = { hasSendScope: true },
): Promise<void> {
  const res = await api.post("/test/seed-gmail-integration", {
    data: { has_send_scope: opts.hasSendScope },
  });
  if (!res.ok()) {
    throw new Error(`seedGmailIntegration failed: ${res.status()}`);
  }
}

async function removeGmailIntegration(api: APIRequestContext): Promise<void> {
  await api.delete("/test/seed-gmail-integration").catch(() => {});
}

async function enableMockGmailSend(api: APIRequestContext): Promise<void> {
  const res = await api.post("/test/mock-gmail-send/enable");
  if (!res.ok()) {
    throw new Error(`enableMockGmailSend failed: ${res.status()}`);
  }
}

async function disableMockGmailSend(api: APIRequestContext): Promise<void> {
  await api.post("/test/mock-gmail-send/disable").catch(() => {});
}

async function gotoInquiryDetail(page: Page, inquiryId: string): Promise<void> {
  await page.goto(`/inquiries/${inquiryId}`);
  await expect(page.getByTestId("inquiry-action-row")).toBeVisible({ timeout: 10000 });
}

test.describe("Templated reply flow (PR 2.3)", () => {
  test.afterEach(async ({ api }) => {
    await disableMockGmailSend(api);
    await removeGmailIntegration(api);
  });

  test("template-based reply: open panel, pick template, edit, send, message lands in thread", async ({
    authedPage: page, api,
  }) => {
    const runId = Date.now();
    const seededIds: string[] = [];

    try {
      await seedGmailIntegration(api, { hasSendScope: true });
      await enableMockGmailSend(api);

      const inquiryId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: `E2E Reply Inquirer ${runId}`,
        inquirer_email: `reply-${runId}@example.com`,
        desired_start_date: "2026-09-01",
        desired_end_date: "2026-11-30",
      });
      seededIds.push(inquiryId);

      await gotoInquiryDetail(page, inquiryId);

      // Reply panel opens.
      await page.getByTestId("inquiry-reply-button").click();
      await expect(page.getByTestId("inquiry-reply-panel")).toBeVisible();

      // Default seeded templates are present.
      const initialReplyCard = page.locator(
        "[data-testid^='reply-template-card-']",
      ).first();
      await initialReplyCard.click();

      // Editor populates with rendered text — wait for the subject input to fill.
      const subjectInput = page.getByTestId("reply-subject-input");
      await expect(subjectInput).not.toHaveValue("", { timeout: 10000 });
      const bodyInput = page.getByTestId("reply-body-input");
      await expect(bodyInput).not.toHaveValue("");

      // Edit the subject.
      await subjectInput.fill(`E2E reply ${runId}`);

      // Send.
      const sendResponse = page.waitForResponse(
        (r) => r.url().includes(`/api/inquiries/${inquiryId}/reply`) &&
              r.request().method() === "POST",
      );
      await page.getByTestId("reply-send-button").click();
      const resp = await sendResponse;
      expect(resp.ok()).toBeTruthy();

      // Panel closes; the thread now shows our outbound message subject.
      await expect(page.getByTestId("inquiry-reply-panel")).toHaveCount(0, {
        timeout: 5000,
      });
      // The thread re-renders via tag invalidation.
      await expect(page.getByText(`E2E reply ${runId}`).first()).toBeVisible({
        timeout: 5000,
      });

      // Verify backend state via API: stage advanced, event emitted.
      const detailResp = await api.get(`/inquiries/${inquiryId}`);
      expect(detailResp.ok()).toBeTruthy();
      const detail = (await detailResp.json()) as {
        stage: string;
        events: { event_type: string; actor: string }[];
        messages: { direction: string; subject: string }[];
      };
      expect(detail.stage).toBe("replied");
      expect(detail.events.some((e) => e.event_type === "replied" && e.actor === "host")).toBe(true);
      expect(
        detail.messages.some(
          (m) => m.direction === "outbound" && m.subject === `E2E reply ${runId}`,
        ),
      ).toBe(true);
    } finally {
      for (const id of seededIds) await deleteInquiry(api, id);
    }
  });

  test("missing send scope shows reconnect banner instead of composer", async ({
    authedPage: page, api,
  }) => {
    const runId = Date.now();
    const seededIds: string[] = [];

    try {
      // Remove any prior Gmail integration first to defeat RTK Query cache.
      await removeGmailIntegration(api);
      // Seed with READONLY-only scope — no gmail.send.
      await seedGmailIntegration(api, { hasSendScope: false });

      const inquiryId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: `E2E Scope Inquirer ${runId}`,
        inquirer_email: `scope-${runId}@example.com`,
      });
      seededIds.push(inquiryId);

      await gotoInquiryDetail(page, inquiryId);
      // Force a fresh /api/integrations fetch — RTK cache may hold the
      // previous test's integration state.
      await page.reload();
      await expect(page.getByTestId("inquiry-action-row")).toBeVisible({ timeout: 10000 });

      await page.getByTestId("inquiry-reply-button").click();

      await expect(page.getByTestId("gmail-reconnect-banner")).toBeVisible();
      // The send button is disabled.
      await expect(page.getByTestId("reply-send-button")).toBeDisabled();
    } finally {
      for (const id of seededIds) await deleteInquiry(api, id);
    }
  });

  test("custom (no template) reply: write subject + body manually and send", async ({
    authedPage: page, api,
  }) => {
    const runId = Date.now();
    const seededIds: string[] = [];

    try {
      await seedGmailIntegration(api, { hasSendScope: true });
      await enableMockGmailSend(api);

      const inquiryId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: `E2E Custom Inquirer ${runId}`,
        inquirer_email: `custom-${runId}@example.com`,
      });
      seededIds.push(inquiryId);

      await gotoInquiryDetail(page, inquiryId);

      await page.getByTestId("inquiry-reply-button").click();
      await page.getByTestId("reply-tab-custom").click();

      const subject = `E2E custom subject ${runId}`;
      const body = `Custom plain body for ${runId}.`;
      await page.getByTestId("reply-subject-input").fill(subject);
      await page.getByTestId("reply-body-input").fill(body);

      const sendResponse = page.waitForResponse(
        (r) => r.url().includes(`/api/inquiries/${inquiryId}/reply`) &&
              r.request().method() === "POST",
      );
      await page.getByTestId("reply-send-button").click();
      const resp = await sendResponse;
      expect(resp.ok()).toBeTruthy();

      // Panel closes.
      await expect(page.getByTestId("inquiry-reply-panel")).toHaveCount(0, {
        timeout: 5000,
      });
      await expect(page.getByText(subject).first()).toBeVisible({ timeout: 5000 });

      // Verify the message has no template_id — it was a custom write.
      const detail = await (await api.get(`/inquiries/${inquiryId}`)).json() as {
        messages: { direction: string; subject: string }[];
      };
      expect(
        detail.messages.find(
          (m) => m.direction === "outbound" && m.subject === subject,
        ),
      ).toBeTruthy();
    } finally {
      for (const id of seededIds) await deleteInquiry(api, id);
    }
  });
});
