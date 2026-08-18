import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Mortgage capture — full-flow behavioural E2E against the real backend.
 *
 * Drives the journey the operator actually takes: record a loan through the
 * dialog on the Mortgages page against the property it is secured by → see the
 * rate and balance in the list → correct the balance when the next statement
 * arrives → remove the loan when it is paid off.
 *
 * The loan seeded here is 6734 Peerless as its TDECU statement reads — 7.125%
 * on $336,137.35 with the payment split out — because the payment split is what
 * the comparison derives the remaining term from when no payoff date is known,
 * and a round-number fixture would never exercise it.
 *
 * The second test covers the adjustable case. An ARM cannot be benchmarked
 * against a fixed-rate survey, so the rate type is the one field the reader is
 * not allowed to guess: it is what decides whether a loan is compared at all.
 *
 * Verifies UI state AND backend state via the public API, and cleans up every
 * seeded row in `finally` per the project's "never leave test data" rule.
 */

interface MortgageRow {
  id: string;
  lender: string | null;
  account_number: string | null;
  interest_rate: string | null;
  rate_type: string;
  fixed_until: string | null;
  current_balance_cents: number | null;
  statement_date: string | null;
  monthly_principal_cents: number | null;
  monthly_interest_cents: number | null;
  monthly_escrow_cents: number | null;
  notes: string | null;
}

async function fetchMortgage(
  api: APIRequestContext,
  id: string,
): Promise<MortgageRow> {
  const res = await api.get(`/mortgages/${id}`);
  if (!res.ok()) {
    throw new Error(`fetchMortgage failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

async function waitForMortgagesPage(page: Page): Promise<void> {
  await page.goto("/mortgages");
  await expect(page.getByTestId("add-mortgage-button")).toBeVisible({
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
}

async function idFromRow(page: Page, propertyName: string): Promise<string> {
  const row = page.locator('[data-testid^="mortgage-item-"]', {
    hasText: propertyName,
  });
  await expect(row).toBeVisible({ timeout: 10000 });
  const testId = await row.getAttribute("data-testid");
  const id = testId?.replace("mortgage-item-", "") ?? "";
  expect(id, "could not parse the mortgage id from the row").toBeTruthy();
  return id;
}

test.describe("Mortgage capture", () => {
  test("record a loan, see it listed, restate the balance, then remove it", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const propertyName = `E2E Mortgage Property ${runId}`;
    let propertyId: string | null = null;
    let mortgageId: string | null = null;

    try {
      const property = await createProperty(api, {
        name: propertyName,
        address: `${runId} Peerless St, Houston, TX 77021`,
      });
      propertyId = property.id as string;

      // 1) CREATE through the dialog.
      await waitForMortgagesPage(page);
      await page.getByTestId("add-mortgage-button").click();
      await expect(page.getByTestId("add-mortgage-dialog")).toBeVisible();

      await page.getByTestId("mortgage-property-select").selectOption(propertyId);
      await page.getByTestId("mortgage-lender-input").fill("E2E Credit Union");
      await page.getByTestId("mortgage-interest-rate-input").fill("7.125");
      await page.getByTestId("mortgage-rate-type-select").selectOption("fixed");
      await page.getByTestId("mortgage-balance-input").fill("336137.35");
      await page.getByTestId("mortgage-statement-date-input").fill("2026-08-01");
      await page.getByTestId("mortgage-monthly-principal-input").fill("301.56");
      await page.getByTestId("mortgage-monthly-interest-input").fill("1995.82");
      await page.getByTestId("mortgage-monthly-escrow-input").fill("870.81");
      await page.getByTestId("mortgage-account-number-input").fill("E2E-240224944");
      await page.getByTestId("mortgage-save-button").click();

      await expect(page.getByTestId("add-mortgage-dialog")).toBeHidden({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      mortgageId = await idFromRow(page, propertyName);

      // 2) The row leads with the rate, to the precision the note was written
      //    to, and dates the balance every figure below is computed from.
      await expect(page.getByTestId(`mortgage-rate-${mortgageId}`)).toHaveText(
        "7.125%",
      );
      await expect(page.getByTestId("mortgages-list")).toContainText("$336,137");
      await expect(page.getByTestId("mortgages-list")).toContainText(
        "Balance as of Aug 1, 2026",
      );
      // A fixed loan carries no adjustable badge — that label is what says a
      // loan cannot be benchmarked.
      await expect(
        page.getByTestId(`mortgage-arm-badge-${mortgageId}`),
      ).toHaveCount(0);

      // 3) The backend stored the figures unrounded, with the split intact.
      const saved = await fetchMortgage(api, mortgageId);
      expect(saved.rate_type).toBe("fixed");
      expect(Number(saved.interest_rate)).toBeCloseTo(7.125, 3);
      expect(saved.current_balance_cents).toBe(33613735);
      expect(saved.statement_date).toBe("2026-08-01");
      expect(saved.monthly_principal_cents).toBe(30156);
      expect(saved.monthly_interest_cents).toBe(199582);
      expect(saved.monthly_escrow_cents).toBe(87081);
      expect(saved.fixed_until).toBeNull();

      // 4) EDIT: next month's statement, a lower balance and a moved split.
      await page.getByTestId(`mortgage-item-${mortgageId}`).click();
      await expect(page.getByTestId("edit-mortgage-dialog")).toBeVisible();
      // Prefilled from the stored row, not blank.
      await expect(page.getByTestId("mortgage-balance-input")).toHaveValue(
        "336137.35",
        { timeout: 10000 },
      );
      await expect(page.getByTestId("mortgage-lender-input")).toHaveValue(
        "E2E Credit Union",
      );

      await page.getByTestId("mortgage-balance-input").fill("335835.79");
      await page.getByTestId("mortgage-statement-date-input").fill("2026-09-01");
      await page.getByTestId("mortgage-monthly-principal-input").fill("303.35");
      await page.getByTestId("mortgage-monthly-interest-input").fill("1994.03");
      await page.getByTestId("mortgage-update-button").click();

      await expect(page.getByTestId("edit-mortgage-dialog")).toBeHidden({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("mortgages-list")).toContainText("$335,836");
      await expect(page.getByTestId("mortgages-list")).toContainText(
        "Balance as of Sep 1, 2026",
      );

      const restated = await fetchMortgage(api, mortgageId);
      expect(restated.current_balance_cents).toBe(33583579);
      expect(restated.statement_date).toBe("2026-09-01");
      expect(restated.monthly_principal_cents).toBe(30335);
      expect(restated.monthly_interest_cents).toBe(199403);
      // Nothing the edit did not touch was erased.
      expect(restated.lender).toBe("E2E Credit Union");
      expect(Number(restated.interest_rate)).toBeCloseTo(7.125, 3);
      expect(restated.monthly_escrow_cents).toBe(87081);

      // 5) DELETE: the loan is paid off and comes off the page. Removing one
      //    is confirmed first — it was typed in by hand off a paper statement.
      await page.getByTestId(`mortgage-item-${mortgageId}`).click();
      await expect(page.getByTestId("edit-mortgage-dialog")).toBeVisible();
      await page.getByTestId("mortgage-delete-button").click();
      const confirm = page
        .getByRole("dialog")
        .filter({ hasText: "Remove this mortgage?" });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Remove", exact: true }).click();

      await expect(page.getByTestId("edit-mortgage-dialog")).toBeHidden({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByTestId(`mortgage-item-${mortgageId}`),
      ).toHaveCount(0);

      const afterDelete = await api.get(`/mortgages/${mortgageId}`);
      expect(afterDelete.status()).toBe(404);
      mortgageId = null;
    } finally {
      if (mortgageId) await api.delete(`/mortgages/${mortgageId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("an adjustable loan records its reset date and says so in the list", async ({
    authedPage: page,
    api,
  }) => {
    // 6732 Peerless prints "Interest Rate Until February, 2035". That date is
    // the whole reason the loan cannot be compared against a fixed-rate survey,
    // so it has to survive capture and be visible without opening the dialog.
    const runId = Date.now();
    const propertyName = `E2E ARM Property ${runId}`;
    let propertyId: string | null = null;
    let mortgageId: string | null = null;

    try {
      const property = await createProperty(api, { name: propertyName });
      propertyId = property.id as string;

      await waitForMortgagesPage(page);
      await page.getByTestId("add-mortgage-button").click();
      await expect(page.getByTestId("add-mortgage-dialog")).toBeVisible();

      await page.getByTestId("mortgage-property-select").selectOption(propertyId);
      await page.getByTestId("mortgage-interest-rate-input").fill("8.250");

      // The reset-date field does not exist until the loan is adjustable —
      // on a fixed loan it would read as a rate change that is never coming.
      await expect(page.getByTestId("mortgage-fixed-until-input")).toHaveCount(0);
      await page.getByTestId("mortgage-rate-type-select").selectOption("arm");
      await page.getByTestId("mortgage-fixed-until-input").fill("2035-02-01");

      await page.getByTestId("mortgage-balance-input").fill("280888.80");
      await page.getByTestId("mortgage-statement-date-input").fill("2026-08-01");
      await page.getByTestId("mortgage-save-button").click();

      await expect(page.getByTestId("add-mortgage-dialog")).toBeHidden({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      mortgageId = await idFromRow(page, propertyName);
      await expect(
        page.getByTestId(`mortgage-arm-badge-${mortgageId}`),
      ).toHaveText("Adjustable");

      const saved = await fetchMortgage(api, mortgageId);
      expect(saved.rate_type).toBe("arm");
      expect(saved.fixed_until).toBe("2035-02-01");
      expect(saved.current_balance_cents).toBe(28088880);

      // The rate check lists it, and says why it could not be compared —
      // a loan that silently vanished would read as one that was found fine.
      await page.getByTestId("check-mortgage-rates-button").click();
      const results = page.getByTestId("mortgage-rate-watch-results");
      await expect(results).toBeVisible({ timeout: 30000 });
      const card = page
        .getByTestId("mortgage-outlook-card")
        .filter({ hasText: propertyName });
      await expect(card).toHaveCount(1);
      await expect(
        card.getByTestId("mortgage-outlook-unavailable"),
      ).toBeVisible();
    } finally {
      if (mortgageId) await api.delete(`/mortgages/${mortgageId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });
});
