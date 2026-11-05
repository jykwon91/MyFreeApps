import { describe, expect, it } from "vitest";
import { RECONCILIATION_COMPARE_MESSAGES as MESSAGES } from "../constants/reconciliationCompare";
import type { ReconciliationSource } from "../types/reconciliation/reconciliation-source";
import { compareFailureMessage, compareResultMessage, hasBeenCompared } from "../utils/reconciliationCompare";

describe("hasBeenCompared", () => {
  it.each([
    ["unmatched", false],
    ["partial", true],
    ["matched", true],
    ["confirmed", true],
  ] as const)("%s -> %s", (status, expected) => {
    expect(hasBeenCompared({ status } as ReconciliationSource)).toBe(expected);
  });
});

describe("compareResultMessage", () => {
  it("says nothing was found when no form could be compared", () => {
    expect(compareResultMessage({ sources_checked: 2, auto_matched: 0, discrepancies: 0 })).toBe(MESSAGES.nothingFound);
  });

  it("counts matches and differences, and names what was skipped", () => {
    expect(compareResultMessage({ sources_checked: 2, auto_matched: 1, discrepancies: 1 })).toBe("1 matched, 1 differs.");
    expect(compareResultMessage({ sources_checked: 5, auto_matched: 1, discrepancies: 2 })).toBe(
      "1 matched, 2 differ. 2 had nothing to compare.",
    );
  });
});

describe("compareFailureMessage", () => {
  it.each([
    [{ data: undefined }, MESSAGES.compareUnreachable],
    [{ status: 403 }, MESSAGES.viewerRefused],
    [{ status: 500 }, MESSAGES.compareFailed],
    [null, MESSAGES.compareUnreachable],
  ])("%j", (error, message) => {
    expect(compareFailureMessage(error)).toBe(message);
  });
});
