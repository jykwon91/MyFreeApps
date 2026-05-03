import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * E2E tests for editable contract dates (PR mbk-applicant-contract-dates-editable).
 *
 * Covers:
 * 1. Happy path: edit contract_end → blur → DB updated + applicant_event written.
 * 2. Locked state: lease_signed applicant → date inputs are read-only + lock icon visible.
 */

async function seedApplicant(
  api: APIRequestContext,
  stage: string,
  opts: {
    legalName?: string;
    contractStart?: string;
    contractEnd?: string;
  } = {},
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: {
      stage,
      legal_name: opts.legalName ?? `E2E Contract ${Date.now()}`,
      contract_start: opts.contractStart ?? null,
      contract_end: opts.contractEnd ?? null,
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

test.describe("Contract dates editing (PR mbk-applicant-contract-dates-editable)", () => {
  test("edit contract_end on a lead applicant — DB updated + event written", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lead", {
        legalName: `E2E Contract Edit ${runId}`,
        contractStart: "2026-06-01",
        contractEnd: "2026-12-31",
      });

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      // Contract section must be visible.
      await expect(page.getByTestId("contract-section")).toBeVisible({ timeout: 10000 });

      // The contract_end input should be visible and editable.
      const endInput = page.getByTestId("contract-date-input-contract_end");
      await expect(endInput).toBeVisible();
      await expect(endInput).not.toBeDisabled();

      // Clear and type a new date.
      await endInput.fill("2026-11-30");

      // Blur the input to trigger the debounced save.
      await endInput.blur();

      // Wait for the save to complete (network idle or toast).
      await page.waitForLoadState("networkidle");

      // Verify via API that the DB has the new value.
      const updated = await getApplicant(api, applicantId);
      expect(updated.contract_end).toBe("2026-11-30");

      // contract_start must be untouched.
      expect(updated.contract_start).toBe("2026-06-01");

      // A contract_dates_changed event must have been written.
      const changeEvent = updated.events.find(
        (e) => e.event_type === "contract_dates_changed",
      );
      expect(changeEvent).toBeDefined();
      expect(changeEvent?.actor).toBe("host");
      const to = changeEvent?.payload?.to as
        | { contract_start: string; contract_end: string }
        | undefined;
      expect(to?.contract_end).toBe("2026-11-30");
      expect(to?.contract_start).toBe("2026-06-01");
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });

  test("lease_signed applicant — date inputs are read-only with lock icon", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";

    try {
      applicantId = await seedApplicant(api, "lease_signed", {
        legalName: `E2E Contract Locked ${runId}`,
        contractStart: "2026-06-01",
        contractEnd: "2026-12-31",
      });

      await page.goto(`/applicants/${applicantId}`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("contract-section")).toBeVisible({ timeout: 10000 });

      // Editable inputs should NOT be present.
      await expect(page.getByTestId("contract-date-input-contract_start")).toHaveCount(0);
      await expect(page.getByTestId("contract-date-input-contract_end")).toHaveCount(0);

      // Locked read-only elements with lock icons must be present.
      await expect(
        page.getByTestId("contract-dates-locked-contract_start"),
      ).toBeVisible();
      await expect(
        page.getByTestId("contract-dates-locked-contract_end"),
      ).toBeVisible();
      await expect(
        page.getByTestId("contract-dates-lock-icon-contract_start"),
      ).toBeVisible();
      await expect(
        page.getByTestId("contract-dates-lock-icon-contract_end"),
      ).toBeVisible();
    } finally {
      if (applicantId) await deleteApplicant(api, applicantId);
    }
  });
});
