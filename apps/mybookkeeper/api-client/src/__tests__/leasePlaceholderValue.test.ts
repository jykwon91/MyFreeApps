import { describe, expect, it } from "vitest";
import { isReadableLeaseNumber, leaseValueText } from "../utils/leasePlaceholderValue";

describe("isReadableLeaseNumber", () => {
  it.each(["1500", "1500.50", "$1,500", "$1,500.00", "-12", " 42 ", "0"])("reads %s", (value) => {
    expect(isReadableLeaseNumber(value)).toBe(true);
  });

  it.each(["abc", "12abc", "1,50", "1.2.3", "$", "", "1e5", "twelve hundred"])("rejects %s", (value) => {
    expect(isReadableLeaseNumber(value)).toBe(false);
  });
});

describe("leaseValueText", () => {
  it("shows a dash for nothing", () => {
    expect(leaseValueText(null)).toBe("—");
    expect(leaseValueText(undefined)).toBe("—");
    expect(leaseValueText("")).toBe("—");
  });

  it("shows text, numbers and booleans as they are", () => {
    expect(leaseValueText("Dana")).toBe("Dana");
    expect(leaseValueText(1500)).toBe("1500");
    expect(leaseValueText(false)).toBe("false");
  });

  it("writes out a nested value instead of [object Object]", () => {
    expect(leaseValueText({ a: 1 })).toBe('{"a":1}');
  });
});
