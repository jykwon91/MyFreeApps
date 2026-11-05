import { describe, it, expect } from "vitest";
import { receiptPayerName } from "../utils/receiptPayerName";

describe("receiptPayerName", () => {
  it("uses the tenant's name when the host can see it", () => {
    expect(receiptPayerName({ tenant_name: "Alice Johnson", payer_name: "A JOHNSON" })).toBe("Alice Johnson");
  });

  it("falls back to the name on the payment", () => {
    expect(receiptPayerName({ tenant_name: null, payer_name: "A JOHNSON" })).toBe("A JOHNSON");
  });

  it("returns null when neither is known", () => {
    expect(receiptPayerName({ tenant_name: null, payer_name: null })).toBeNull();
  });
});
