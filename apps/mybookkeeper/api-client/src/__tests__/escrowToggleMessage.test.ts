import { describe, expect, it } from "vitest";
import { referenceOnlyMarkedMessage } from "../utils/escrowToggleMessage";

describe("referenceOnlyMarkedMessage", () => {
  it("says nothing was removed when there were no transactions", () => {
    expect(referenceOnlyMarkedMessage(0)).toBe("Marked as reference-only");
  });

  it("says how many transactions went, in the singular and the plural", () => {
    expect(referenceOnlyMarkedMessage(1)).toBe("Marked as reference-only — removed 1 transaction");
    expect(referenceOnlyMarkedMessage(3)).toBe("Marked as reference-only — removed 3 transactions");
  });
});
