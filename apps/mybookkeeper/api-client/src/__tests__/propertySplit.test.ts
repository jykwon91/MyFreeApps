import { describe, expect, it } from "vitest";
import {
  canSplit,
  checkDraft,
  draftFromSplits,
  draftShares,
  draftStatus,
  evenDraft,
  evenShareCents,
  splitDetail,
} from "../utils/propertySplit";
import { hasProperty, toSelectionRef } from "../utils/transactionSelectionRef";
import type { PropertySplitDraftRow } from "../types/transaction/PropertySplitDraftRow";
import type { Transaction } from "../types/transaction/transaction";

const HOUSES = ["p1", "p2", "p3"];

function rows(...amounts: (string | null)[]): PropertySplitDraftRow[] {
  return amounts.map((amount, index) => ({ property_id: HOUSES[index], included: amount !== null, amount: amount ?? "" }));
}

describe("evenShareCents", () => {
  it("gives the odd cents to the first properties so the shares add up", () => {
    expect(evenShareCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(evenShareCents(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(evenShareCents(9000, 3)).toEqual([3000, 3000, 3000]);
  });

  it("has no shares for no properties", () => {
    expect(evenShareCents(10000, 0)).toEqual([]);
  });
});

describe("drafts", () => {
  it("ticks and fills in the properties the transaction is already split across", () => {
    expect(draftFromSplits(HOUSES, [{ property_id: "p3", amount: "60.00" }, { property_id: "p1", amount: "40.00" }])).toEqual([
      { property_id: "p1", included: true, amount: "40.00" },
      { property_id: "p2", included: false, amount: "" },
      { property_id: "p3", included: true, amount: "60.00" },
    ]);
  });

  it("splits evenly across the ticked properties and clears the others", () => {
    expect(evenDraft(rows("1", null, "5"), 10001).map((row) => row.amount)).toEqual(["50.01", "", "50.00"]);
  });

  it("can save once two or more shares add up to the amount", () => {
    expect(checkDraft(rows("33.34", "33.33", "33.33"), 10000, ".").canSave).toBe(true);
    expect(checkDraft(rows("70", "30", null), 10000, ".").canSave).toBe(true);
  });

  it("says what's left, what's over, and when too few are ticked", () => {
    const short = checkDraft(rows("50", "40", null), 10000, ".");
    expect(short).toMatchObject({ remainingCents: 1000, canSave: false });
    expect(draftStatus(short, "100.00")).toBe("$10.00 left to assign");

    const over = checkDraft(rows("60", "50", null), 10000, ".");
    expect(draftStatus(over, "100.00")).toBe("$10.00 more than the transaction");

    const one = checkDraft(rows("100", null, null), 10000, ".");
    expect(one.canSave).toBe(false);
    expect(draftStatus(one, "100.00")).toBe("Tick at least two properties.");

    expect(draftStatus(checkDraft(rows("70", "30", null), 10000, "."), "100.00")).toBe("$100.00 of $100.00 assigned");
  });

  it("won't save a blank, zero or unreadable share", () => {
    expect(checkDraft(rows("100", "", null), 10000, ".").hasBadShare).toBe(true);
    expect(checkDraft(rows("100", "0", null), 10000, ".").hasBadShare).toBe(true);
    expect(checkDraft(rows("100", "abc", null), 10000, ".").hasBadShare).toBe(true);
  });

  it("sends only the ticked shares, to the cent", () => {
    expect(draftShares(rows("70", null, "30.5"), ".")).toEqual([
      { property_id: "p1", amount: "70.00" },
      { property_id: "p3", amount: "30.50" },
    ]);
  });
});

describe("splitDetail", () => {
  it("names each share, and a deleted property's share", () => {
    const names = new Map([["p1", "6732 Peerless"]]);
    expect(splitDetail([{ property_id: "p1", amount: "50.00" }, { property_id: null, amount: "50.00" }], names)).toBe(
      "6732 Peerless $50.00, Deleted property $50.00",
    );
  });
});

describe("canSplit", () => {
  const expense = { transaction_type: "expense", transaction_scope: "rental", status: "approved" } as Pick<
    Transaction,
    "transaction_type" | "transaction_scope" | "status"
  >;

  it("splits rental or business money when there are two properties", () => {
    expect(canSplit(expense, 2)).toBe(true);
    expect(canSplit(expense, 1)).toBe(false);
  });

  it("never splits a transfer, personal money, a duplicate or a personal transfer", () => {
    expect(canSplit({ ...expense, transaction_type: "transfer" }, 3)).toBe(false);
    expect(canSplit({ ...expense, transaction_scope: "personal" }, 3)).toBe(false);
    expect(canSplit({ ...expense, status: "duplicate" }, 3)).toBe(false);
    expect(canSplit({ ...expense, status: "personal_transfer" }, 3)).toBe(false);
  });
});

describe("selection refs", () => {
  it("count a split transaction as having a property", () => {
    const split = toSelectionRef({
      id: "t1",
      status: "pending",
      property_id: null,
      property_splits: [{ property_id: "p1", amount: "50.00" }, { property_id: "p2", amount: "50.00" }],
    } as Transaction);
    expect(split.is_split).toBe(true);
    expect(hasProperty(split)).toBe(true);
    expect(hasProperty({ ...split, is_split: false })).toBe(false);
    expect(hasProperty({ ...split, is_split: false, property_id: "p1" })).toBe(true);
  });
});
