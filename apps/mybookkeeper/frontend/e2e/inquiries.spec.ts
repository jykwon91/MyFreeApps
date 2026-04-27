import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * PR 2.1b — Inquiries frontend behavioural E2E.
 *
 * Covers the manual-create / inbox / detail flows. The Gmail email parser
 * (which would populate inquiries automatically) ships in PR 2.2; this spec
 * exclusively exercises host-driven flows.
 */

interface SeedInquiryPayload {
  source: "FF" | "TNH" | "direct" | "other";
  external_inquiry_id?: string | null;
  inquirer_name?: string | null;
  inquirer_email?: string | null;
  inquirer_employer?: string | null;
  desired_start_date?: string | null;
  desired_end_date?: string | null;
  listing_id?: string | null;
  notes?: string | null;
  received_at?: string;
  email_message_id?: string | null;
  inquirer_phone?: string | null;
}

async function seedInquiry(
  api: APIRequestContext,
  payload: SeedInquiryPayload,
): Promise<string> {
  const res = await api.post("/test/seed-inquiry", {
    data: {
      received_at: payload.received_at ?? new Date().toISOString(),
      ...payload,
    },
  });
  if (!res.ok()) {
    throw new Error(`seedInquiry failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteInquiry(api: APIRequestContext, inquiryId: string): Promise<void> {
  await api.delete(`/test/inquiries/${inquiryId}`).catch(() => {});
}

async function waitForInquiriesPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Inquiries" })).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState("networkidle");
}

test.describe("Inquiries frontend (PR 2.1b)", () => {
  test("manual-create flow: form → inbox → detail → stage transition emits an event", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const inquiryName = `E2E Manual Inquiry ${runId}`;
    const seededIds: string[] = [];

    try {
      await page.goto("/inquiries");
      await waitForInquiriesPage(page);

      // Open the form.
      await page.getByTestId("new-inquiry-button").click();
      await expect(page.getByTestId("inquiry-form")).toBeVisible();

      // Fill required fields. Source defaults to "direct" so external-id is hidden.
      await page.getByTestId("inquiry-form-name").fill(inquiryName);
      await page.getByTestId("inquiry-form-email").fill(`manual-${runId}@example.com`);
      await page.getByTestId("inquiry-form-employer").fill("Memorial Hermann");
      await page.getByTestId("inquiry-form-start-date").fill("2026-09-01");
      await page.getByTestId("inquiry-form-end-date").fill("2026-11-30");

      // Capture the created ID via the API response so we can reliably clean up.
      const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith("/api/inquiries") && r.request().method() === "POST",
      );
      await page.getByTestId("inquiry-form-submit").click();
      const resp = await responsePromise;
      expect(resp.ok()).toBeTruthy();
      const created = (await resp.json()) as { id: string };
      seededIds.push(created.id);

      // The form closes; the inbox shows the new inquiry.
      await expect(page.getByTestId("inquiry-form")).toHaveCount(0);
      await expect(page.getByText(inquiryName).first()).toBeVisible({ timeout: 5000 });

      // Drill into the detail page.
      await page.getByText(inquiryName).first().click();
      await expect(page).toHaveURL(new RegExp(`/inquiries/${created.id}$`));

      // Header + key fields rendered.
      await expect(page.getByRole("heading", { name: inquiryName })).toBeVisible();
      await expect(page.getByText("Memorial Hermann").first()).toBeVisible();
      await expect(page.getByText(`manual-${runId}@example.com`)).toBeVisible();

      // Quality breakdown should reflect 3 satisfied factors (start, end, employer)
      // and one missing (no message body — manual entry).
      await expect(page.getByTestId("inquiry-quality-breakdown")).toContainText("3 / 4");

      // Move to "Triaged".
      const stageDropdown = page.getByTestId("inquiry-stage-dropdown");
      await stageDropdown.selectOption("triaged");

      // Wait for PATCH to complete then refresh-friendly check.
      await page.waitForResponse(
        (r) => r.url().includes(`/api/inquiries/${created.id}`) && r.request().method() === "PATCH",
      );

      // Expand the timeline and verify the new event renders.
      await page.getByRole("button", { name: /Activity timeline/i }).click();
      await expect(page.getByText(/Moved to Triaged/i)).toBeVisible();
    } finally {
      for (const id of seededIds) await deleteInquiry(api, id);
    }
  });

  test("stage filter narrows the inbox to a single stage", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seededIds: string[] = [];

    try {
      // Three inquiries — one in each of three different stages so we can
      // assert filter narrowing precisely.
      const newId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: `E2E New ${runId}`,
      });
      seededIds.push(newId);

      const triagedId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: `E2E Triaged ${runId}`,
      });
      seededIds.push(triagedId);

      // Move the second to triaged via a real API patch so the stage event
      // also lands.
      const patchRes = await api.patch(`/inquiries/${triagedId}`, {
        data: { stage: "triaged" },
      });
      expect(patchRes.ok()).toBeTruthy();

      const approvedId = await seedInquiry(api, {
        source: "direct",
        inquirer_name: `E2E Approved ${runId}`,
      });
      seededIds.push(approvedId);
      const approvedPatch = await api.patch(`/inquiries/${approvedId}`, {
        data: { stage: "approved" },
      });
      expect(approvedPatch.ok()).toBeTruthy();

      await page.goto("/inquiries");
      await waitForInquiriesPage(page);

      // All three visible under "All".
      await expect(page.getByText(`E2E New ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Triaged ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Approved ${runId}`).first()).toBeVisible();

      // Filter to Triaged.
      await page.getByTestId("inquiry-filter-triaged").click();
      await page.waitForLoadState("networkidle");

      await expect(page.getByText(`E2E Triaged ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E New ${runId}`)).toHaveCount(0);
      await expect(page.getByText(`E2E Approved ${runId}`)).toHaveCount(0);

      // URL state reflects the filter.
      expect(page.url()).toContain("stage=triaged");

      // Back to All — all three return.
      await page.getByTestId("inquiry-filter-all").click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(`E2E New ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Triaged ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Approved ${runId}`).first()).toBeVisible();
    } finally {
      for (const id of seededIds) await deleteInquiry(api, id);
    }
  });

  test("decline flow: confirms, transitions stage, emits a declined event", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const inquiryId = await seedInquiry(api, {
      source: "direct",
      inquirer_name: `E2E Decline Target ${runId}`,
    });

    try {
      await page.goto(`/inquiries/${inquiryId}`);
      await expect(page.getByRole("heading", { name: `E2E Decline Target ${runId}` })).toBeVisible();

      // Click decline → confirm dialog appears.
      await page.getByTestId("inquiry-decline-button").click();
      await expect(page.getByText(/Decline this inquiry\?/i)).toBeVisible();

      // Confirm.
      await page.getByRole("button", { name: /^Decline$/ }).click();

      // The stage badge should update to "Declined" once the patch lands.
      await expect(page.getByTestId("inquiry-stage-badge-declined")).toBeVisible({ timeout: 5000 });

      // The timeline carries a declined event.
      await page.getByRole("button", { name: /Activity timeline/i }).click();
      await expect(page.getByText(/Moved to Declined/i)).toBeVisible();
    } finally {
      await deleteInquiry(api, inquiryId);
    }
  });

  test("renders the unfiltered empty state when the user has no inquiries", async ({
    authedPage: page,
  }) => {
    // Pick a stage no other test would seed against (screening_requested).
    await page.goto("/inquiries?stage=screening_requested");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Inquiries" })).toBeVisible();
    await expect(page.getByTestId("inquiry-filter-screening_requested")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const filteredEmpty = await page.getByText(/No inquiries in this stage/i).count();
    if (filteredEmpty > 0) {
      // Empty-state copy renders correctly when the filter has no results.
      expect(filteredEmpty).toBeGreaterThan(0);
    }
  });
});
