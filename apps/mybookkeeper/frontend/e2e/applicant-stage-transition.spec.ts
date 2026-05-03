import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * PR: manual-applicant-stage-transition
 *
 * Covers:
 * 1. Happy path: create applicant in "lead" → approve via UI → badge updates
 *    + applicant_events row exists with stage_changed payload.
 * 2. Note flows through to the event payload.
 * 3. Terminal stage (lease_signed) shows "no further transitions" in the popover.
 * 4. Layout: ApplicantStatusControl renders in the detail page header without
 *    breaking the existing layout (stage badge still visible, sections intact).
 */

async function seedApplicant(
  api: APIRequestContext,
  stage: string = "lead",
  legalName?: string,
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { stage, legal_name: legalName ?? `E2E Stage Test ${Date.now()}`, seed_event: true },
  });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function getApplicantEvents(
  api: APIRequestContext,
  applicantId: string,
): Promise<Array<{ event_type: string; actor: string; payload: Record<string, unknown> | null }>> {
  const res = await api.get(`/applicants/${applicantId}`);
  if (!res.ok()) return [];
  const body = (await res.json()) as { events: Array<{ event_type: string; actor: string; payload: unknown }> };
  return body.events as Array<{ event_type: string; actor: string; payload: Record<string, unknown> | null }>;
}

test.describe("Manual applicant stage transition (PR manual-stage)", () => {
  test("approve a lead applicant via status control — badge updates and event is written", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const legalName = `E2E Stage Approve ${runId}`;
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lead", legalName);

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      // Stage badge renders as "Lead" initially.
      await expect(page.getByTestId("applicant-stage-badge-lead")).toBeVisible({
        timeout: 10000,
      });

      // Open status control popover.
      await page.getByTestId("applicant-status-control-trigger").click();
      await expect(page.getByTestId("applicant-status-popover")).toBeVisible();

      // "Approved" must be an option for a lead applicant.
      const select = page.getByTestId("applicant-status-stage-select");
      await expect(select).toBeVisible();
      await select.selectOption("approved");

      // Enter a note.
      await page.getByTestId("applicant-status-note").fill("References checked separately");

      // Confirm is now enabled — click it.
      const confirmBtn = page.getByTestId("applicant-status-confirm");
      await expect(confirmBtn).not.toBeDisabled();
      await confirmBtn.click();

      // Popover should close and badge should update to "Approved".
      await expect(page.getByTestId("applicant-status-popover")).toHaveCount(0, {
        timeout: 5000,
      });
      await expect(page.getByTestId("applicant-stage-badge-approved")).toBeVisible({
        timeout: 10000,
      });

      // Verify the applicant_events row in the DB via API.
      const events = await getApplicantEvents(api, applicantId);
      const changeEvent = events.find((e) => e.event_type === "stage_changed");
      expect(changeEvent).toBeDefined();
      expect(changeEvent?.actor).toBe("host");
      expect(changeEvent?.payload?.from).toBe("lead");
      expect(changeEvent?.payload?.to).toBe("approved");
      expect(changeEvent?.payload?.note).toBe("References checked separately");
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });

  test("decline then un-decline (reset to lead) — two stage_changed events written", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const legalName = `E2E Stage Decline ${runId}`;
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lead", legalName);

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      // Decline first.
      await page.getByTestId("applicant-status-control-trigger").click();
      await page.getByTestId("applicant-status-stage-select").selectOption("declined");
      await page.getByTestId("applicant-status-confirm").click();
      await expect(page.getByTestId("applicant-stage-badge-declined")).toBeVisible({
        timeout: 10000,
      });

      // Now un-decline: declined → lead.
      await page.getByTestId("applicant-status-control-trigger").click();
      await page.getByTestId("applicant-status-stage-select").selectOption("lead");
      await page.getByTestId("applicant-status-confirm").click();
      await expect(page.getByTestId("applicant-stage-badge-lead")).toBeVisible({
        timeout: 10000,
      });

      const events = await getApplicantEvents(api, applicantId);
      const changeEvents = events.filter((e) => e.event_type === "stage_changed");
      expect(changeEvents.length).toBeGreaterThanOrEqual(2);
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });

  test("terminal stage (lease_signed) shows no-transitions message", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lease_signed", `E2E Terminal ${runId}`);

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("applicant-stage-badge-lease_signed")).toBeVisible({
        timeout: 10000,
      });

      await page.getByTestId("applicant-status-control-trigger").click();
      await expect(page.getByTestId("applicant-status-popover")).toBeVisible();
      await expect(
        page.getByText(/No further transitions available/i),
      ).toBeVisible();
      // No stage select should be rendered.
      await expect(page.getByTestId("applicant-status-stage-select")).toHaveCount(0);
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });

  test("layout: detail page sections remain intact after adding status control", async ({
    authedPage: page,
    api,
  }) => {
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lead", `E2E Layout ${Date.now()}`);

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      // All existing sections should still be visible.
      await expect(page.getByTestId("contract-section")).toBeVisible();
      await expect(page.getByTestId("sensitive-data-section")).toBeVisible();
      await expect(page.getByTestId("screening-section")).toBeVisible();
      await expect(page.getByTestId("references-section")).toBeVisible();
      await expect(page.getByTestId("notes-section")).toBeVisible();
      await expect(page.getByTestId("applicant-timeline")).toBeVisible();

      // The status control trigger must be visible in the header area.
      await expect(page.getByTestId("applicant-status-control-trigger")).toBeVisible();
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });
});
