import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * E2E tests for editable contract dates on the applicant detail page.
 *
 * Post-PR-1b scope: only ``contract_start`` is editable. ``contract_end``
 * is derived from the latest signed lease's ``ends_on`` and is rendered
 * as a read-only display on the detail page.
 *
 * Covers:
 * 1. Happy path: edit contract_start → blur → DB updated + applicant_event written.
 * 2. Locked state: lease_signed applicant → contract_start input is read-only
 *    with a lock icon; contract_end is rendered as a plain read-only display
 *    (no lock icon — it has never been editable on the applicant).
 */

async function seedApplicant(
  api: APIRequestContext,
  stage: string,
  opts: {
    legalName?: string;
  } = {},
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: {
      stage,
      legal_name: opts.legalName ?? `E2E Contract ${Date.now()}`,
      seed_event: true,
    },
  });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function getApplicant(
  api: APIRequestContext,
  id: string,
): Promise<{
  contract_start: string | null;
  contract_end: string | null;
  events: Array<{ event_type: string; actor: string; payload: Record<string, unknown> | null }>;
}> {
  const res = await api.get(`/applicants/${id}`);
  if (!res.ok()) throw new Error(`getApplicant failed: ${res.status()}`);
  return res.json() as Promise<{
    contract_start: string | null;
    contract_end: string | null;
    events: Array<{
      event_type: string;
      actor: string;
      payload: Record<string, unknown> | null;
    }>;
  }>;
}

test.describe("Contract dates editing", () => {
  test("edit contract_start on a lead applicant — DB updated + event written", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lead", {
        legalName: `E2E Contract Edit ${runId}`,
      });

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("contract-section")).toBeVisible({
        timeout: 10000,
      });

      const startInput = page.getByTestId("contract-date-input-contract_start");
      await expect(startInput).toBeVisible();
      await expect(startInput).not.toBeDisabled();

      await startInput.fill("2026-07-01");
      await startInput.blur();

      await page.waitForLoadState("networkidle");

      const updated = await getApplicant(api, applicantId);
      expect(updated.contract_start).toBe("2026-07-01");

      const changeEvent = updated.events.find(
        (e) => e.event_type === "contract_dates_changed",
      );
      expect(changeEvent).toBeDefined();
      expect(changeEvent?.actor).toBe("host");
      const to = changeEvent?.payload?.to as
        | { contract_start: string }
        | undefined;
      expect(to?.contract_start).toBe("2026-07-01");
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });

  test("contract_end has no editable input — always rendered as read-only display", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lead", {
        legalName: `E2E Contract End ReadOnly ${runId}`,
      });

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("contract-section")).toBeVisible({
        timeout: 10000,
      });

      // contract_end is never editable on the applicant — it's derived
      // from the latest signed lease.
      await expect(
        page.getByTestId("contract-date-input-contract_end"),
      ).toHaveCount(0);
      await expect(page.getByTestId("contract-end-display")).toBeVisible();
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });

  test("lease_signed applicant — contract_start is locked with lock icon", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lease_signed", {
        legalName: `E2E Contract Locked ${runId}`,
      });

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("contract-section")).toBeVisible({
        timeout: 10000,
      });

      await expect(
        page.getByTestId("contract-date-input-contract_start"),
      ).toHaveCount(0);
      await expect(
        page.getByTestId("contract-dates-locked-contract_start"),
      ).toBeVisible();
      await expect(
        page.getByTestId("contract-dates-lock-icon-contract_start"),
      ).toBeVisible();

      // contract_end has its own read-only display path (no lock icon —
      // the field has never been editable on the applicant).
      await expect(page.getByTestId("contract-end-display")).toBeVisible();
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });
});
