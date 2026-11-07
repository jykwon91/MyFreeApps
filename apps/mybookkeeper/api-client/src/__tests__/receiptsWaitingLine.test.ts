import { describe, it, expect } from "vitest";
import { receiptsWaitingLine } from "../utils/receiptsWaitingLine";

describe("receiptsWaitingLine", () => {
  it("counts in the right number", () => {
    expect(receiptsWaitingLine(1)).toBe("1 receipt waiting to send");
    expect(receiptsWaitingLine(3)).toBe("3 receipts waiting to send");
  });
});
