/**
 * Unit tests for the rate-filing display helpers.
 *
 * The distinction these protect is between "the carrier held rates flat" and
 * "no approved change was found". Both are quiet outcomes, only one is good
 * news, and collapsing them into the same dash is how a page tells an operator
 * nothing is coming when in fact nothing was found.
 */
import { describe, it, expect } from "vitest";
import {
  formatChangePct,
  formatFilingDate,
  formatFilingStatus,
  formatOutlookHeadline,
} from "@/shared/lib/rate-filing-format";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

function filing(overrides: Partial<InsuranceRateFiling> = {}): InsuranceRateFiling {
  return {
    serff_id: "SFPT-134523456",
    company_name: "SAFEPOINT INSURANCE COMPANY",
    product_name: "TX DWO",
    percent_change: 11.1,
    filed_date: "2026-05-28",
    effective_date_renewal: "2026-09-01",
    is_in_force: true,
    is_pending: false,
    ...overrides,
  };
}

describe("formatChangePct", () => {
  it("signs an increase", () => {
    expect(formatChangePct(11.1)).toBe("+11.1%");
  });

  it("keeps a decrease negative", () => {
    expect(formatChangePct(-4.2)).toBe("-4.2%");
  });

  it("spells out a flat filing rather than showing a signed zero", () => {
    expect(formatChangePct(0)).toBe("no change");
  });

  it("shows an unstated change as missing, not as zero", () => {
    expect(formatChangePct(null)).toBe("—");
  });
});

describe("formatFilingDate", () => {
  it("reads an ISO date", () => {
    expect(formatFilingDate("2026-09-01")).toBe("Sep 1, 2026");
  });

  it("handles a missing date", () => {
    expect(formatFilingDate(null)).toBe("—");
  });

  it("handles an unparseable date", () => {
    expect(formatFilingDate("not a date")).toBe("—");
  });
});

describe("formatFilingStatus", () => {
  it("calls an in-force filing approved", () => {
    expect(formatFilingStatus(filing())).toBe("Approved");
  });

  it("calls a pending filing proposed", () => {
    expect(
      formatFilingStatus(filing({ is_in_force: false, is_pending: true })),
    ).toBe("Proposed");
  });

  it("calls a withdrawn filing not approved", () => {
    // Neither in force nor pending — the carrier asked and did not get it.
    expect(
      formatFilingStatus(filing({ is_in_force: false, is_pending: false })),
    ).toBe("Not approved");
  });
});

describe("formatOutlookHeadline", () => {
  it("names the carrier raising rates", () => {
    expect(formatOutlookHeadline(11.1, "SafePoint")).toBe(
      "SafePoint filed an increase",
    );
  });

  it("distinguishes holding flat from finding nothing", () => {
    expect(formatOutlookHeadline(0, "Foremost")).toBe(
      "Foremost is holding rates flat",
    );
    expect(formatOutlookHeadline(null, "Foremost")).toBe(
      "Foremost — no approved change found",
    );
  });

  it("reports a decrease as such", () => {
    expect(formatOutlookHeadline(-4.2, "Foremost")).toBe(
      "Foremost filed a decrease",
    );
  });

  it("falls back when the policy records no carrier", () => {
    expect(formatOutlookHeadline(11.1, null)).toBe(
      "This carrier filed an increase",
    );
  });
});
