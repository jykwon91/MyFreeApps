import { describe, expect, it } from "vitest";
import { describeSyncChanges, formatLastSynced } from "../utils/plaidItemFormat";

const nothing = { added: 0, modified: 0, removed: 0, matched_existing: 0, transfers_matched: 0, status: "active" as const };

describe("describeSyncChanges", () => {
  it("lists only what changed", () => {
    expect(describeSyncChanges({ ...nothing, added: 3, removed: 1 })).toBe("3 new, 1 removed");
  });

  it("is empty when nothing changed", () => {
    expect(describeSyncChanges({ ...nothing, matched_existing: 4 })).toBe("");
  });
});

describe("formatLastSynced", () => {
  it("shows the day and the time", () => {
    expect(formatLastSynced(new Date(2026, 10, 23, 15, 4).toISOString())).toBe("Nov 23, 3:04 PM");
  });
});
