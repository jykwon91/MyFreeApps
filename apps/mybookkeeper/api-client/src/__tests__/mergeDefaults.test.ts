import { describe, expect, it } from "vitest";
import type { DuplicateTransaction } from "../types/transaction/DuplicateTransaction";
import { computeDefaults, computeSurvivingId, differingFields } from "../utils/mergeDefaults";

function aSide(overrides: Partial<DuplicateTransaction> = {}): DuplicateTransaction {
  return {
    id: "a",
    transaction_date: "2026-03-14",
    vendor: "Home Depot",
    description: null,
    amount: "84.20",
    transaction_type: "expense",
    category: "maintenance",
    property_id: "p1",
    payment_method: null,
    channel: null,
    tags: [],
    status: "pending",
    source_document_id: null,
    source_file_name: null,
    is_manual: false,
    created_at: "2026-03-15T00:00:00Z",
    linked_document_ids: [],
    ...overrides,
  };
}

describe("differingFields", () => {
  it("lists only the fields the two sides disagree on", () => {
    expect(differingFields(aSide(), aSide({ id: "b", vendor: "Lowes", description: "Lumber" }))).toEqual(["vendor", "description"]);
  });

  it("skips a field both sides leave empty", () => {
    expect(differingFields(aSide(), aSide({ id: "b" }))).toEqual([]);
  });
});

describe("computeDefaults", () => {
  it("prefers the earlier date and the longer text", () => {
    const defaults = computeDefaults(aSide({ transaction_date: "2026-03-16", vendor: "HD" }), aSide({ id: "b", vendor: "Home Depot" }));
    expect(defaults.transaction_date).toBe("b");
    expect(defaults.vendor).toBe("b");
  });

  it("prefers a real category over uncategorized and a filled value over an empty one", () => {
    const defaults = computeDefaults(aSide({ category: "uncategorized", channel: null }), aSide({ id: "b", channel: "airbnb" }));
    expect(defaults.category).toBe("b");
    expect(defaults.channel).toBe("b");
  });

  it("keeps the first amount", () => {
    expect(computeDefaults(aSide({ amount: "1.00" }), aSide({ id: "b", amount: "2.00" })).amount).toBe("a");
  });
});

describe("computeSurvivingId", () => {
  it("survives the side with more filled fields, the first on a tie", () => {
    expect(computeSurvivingId(aSide(), aSide({ id: "b", channel: "airbnb" }))).toBe("b");
    expect(computeSurvivingId(aSide(), aSide({ id: "b" }))).toBe("a");
  });
});
