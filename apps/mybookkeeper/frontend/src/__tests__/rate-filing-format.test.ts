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
  filingChangeColor,
  filingStatusColor,
  formatChangePct,
  formatFilingConsequence,
  formatFilingDate,
  formatFilingStatus,
  formatFoldSummary,
  formatOutlookHeadline,
  formatPremiumDelta,
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
  // Named for the bill, not for the regulator's process. "Approved" /
  // "Proposed" / "Not approved" were three of the four words the operator had
  // to ask the meaning of.
  it("says an in-force filing is in effect", () => {
    expect(formatFilingStatus(filing())).toBe("In effect");
  });

  it("says a pending filing is still awaiting a decision", () => {
    expect(
      formatFilingStatus(filing({ is_in_force: false, is_pending: true })),
    ).toBe("Pending decision");
  });

  it("says a filing that lost is withdrawn", () => {
    // Neither in force nor pending — the carrier asked and did not get it.
    expect(
      formatFilingStatus(filing({ is_in_force: false, is_pending: false })),
    ).toBe("Withdrawn");
  });
});

describe("formatFilingConsequence", () => {
  it("tells the operator an in-force filing is what they'll be charged", () => {
    expect(formatFilingConsequence(filing())).toBe(
      "In effect — this is the rate you'll be charged.",
    );
  });

  it("says a pending filing may still be cut or refused", () => {
    expect(
      formatFilingConsequence(filing({ is_in_force: false, is_pending: true })),
    ).toContain("could be cut or refused");
  });

  it("says a withdrawn filing never reached a bill", () => {
    expect(
      formatFilingConsequence(filing({ is_in_force: false, is_pending: false })),
    ).toContain("never reached a bill");
  });
});

describe("formatOutlookHeadline", () => {
  it("calls an increase a statewide average, not a quote", () => {
    // "average" and "with the state" are the two qualifiers that stop +11.1%
    // reading as a number someone quoted for this house.
    expect(formatOutlookHeadline(11.1, "SafePoint")).toBe(
      "SafePoint filed an average rate increase with the state.",
    );
  });

  it("distinguishes holding flat from finding nothing", () => {
    expect(formatOutlookHeadline(0, "Foremost")).toBe(
      "Foremost filed with the state to hold dwelling rates flat.",
    );
    expect(formatOutlookHeadline(null, "Foremost")).toBe(
      "Foremost's recent filings didn't result in a rate change that took effect.",
    );
  });

  it("distinguishes nothing-in-force from a decision not yet made", () => {
    // Same null percentage, opposite meanings: one carrier is settled and
    // quiet, the other has a live filing that could land before renewal.
    expect(
      formatOutlookHeadline(null, "Foremost", { hasPendingOnly: true }),
    ).toBe("Foremost has a rate change pending with the state — not decided yet.");
  });

  it("reports a decrease as such", () => {
    expect(formatOutlookHeadline(-4.2, "Foremost")).toBe(
      "Foremost filed a rate decrease with the state.",
    );
  });

  it("falls back when the policy records no carrier", () => {
    expect(formatOutlookHeadline(11.1, null)).toBe(
      "This carrier filed an average rate increase with the state.",
    );
  });
});

describe("formatFoldSummary", () => {
  it("counts what is hidden", () => {
    expect(
      formatFoldSummary([filing({ is_in_force: false, is_pending: false })]),
    ).toBe("See 1 more filing from this carrier");
  });

  it("surfaces a pending filing rather than burying it in the fold", () => {
    // A live filing is the reason anyone opens this, so hiding that fact
    // behind the fold would defeat the fold.
    expect(
      formatFoldSummary([
        filing({ is_in_force: false, is_pending: false }),
        filing({ serff_id: "X-2", is_in_force: false, is_pending: true }),
      ]),
    ).toBe(
      "See 2 more filings from this carrier, including one still pending a decision",
    );
  });
});

describe("filing badge colours", () => {
  it("greys a flat or unstated change and warns on a rise", () => {
    expect(filingChangeColor(null)).toBe("gray");
    expect(filingChangeColor(0)).toBe("gray");
    expect(filingChangeColor(11.1)).toBe("orange");
    expect(filingChangeColor(-4.2)).toBe("green");
  });

  it("marks only an undecided filing as still live", () => {
    expect(filingStatusColor(filing())).toBe("gray");
    expect(
      filingStatusColor(filing({ is_in_force: false, is_pending: true })),
    ).toBe("yellow");
    expect(
      filingStatusColor(filing({ is_in_force: false, is_pending: false })),
    ).toBe("gray");
  });
});

describe("formatPremiumDelta", () => {
  it("gives the yearly dollar movement, which is the operator's unit", () => {
    expect(formatPremiumDelta(241_000, 267_751)).toBe("+$268/yr");
  });

  it("marks a decrease with a minus", () => {
    expect(formatPremiumDelta(241_000, 220_000)).toBe("−$210/yr");
  });

  it("returns null when there is no movement to report", () => {
    // Not "+$0/yr" — a carrier holding flat is said in words elsewhere, and a
    // zero dollar figure reads as a rounding artefact.
    expect(formatPremiumDelta(241_000, 241_000)).toBeNull();
  });

  it("returns null when either premium is unknown", () => {
    expect(formatPremiumDelta(null, 267_751)).toBeNull();
    expect(formatPremiumDelta(241_000, null)).toBeNull();
  });
});
