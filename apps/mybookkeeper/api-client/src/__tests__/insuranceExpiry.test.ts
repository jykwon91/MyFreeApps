import { describe, expect, it } from "vitest";
import { daysUntilExpiry, expiryLabel } from "../utils/insuranceExpiry";

describe("daysUntilExpiry", () => {
  it("counts calendar days across a month and year end", () => {
    expect(daysUntilExpiry("2027-01-02", "2026-12-30")).toBe(3);
  });

  it("is negative once past", () => {
    expect(daysUntilExpiry("2026-11-14", "2026-11-16")).toBe(-2);
  });
});

describe("expiryLabel", () => {
  it.each([
    ["2026-11-10", "Expired 5 days ago"],
    ["2026-11-14", "Expired yesterday"],
    ["2026-11-15", "Expires today"],
    ["2026-11-16", "Expires tomorrow"],
    ["2026-11-17", "Expires in 2 days"],
    ["2027-02-13", "Expires in 90 days"],
    ["2027-02-14", null],
  ])("labels %s as %s", (date, label) => {
    expect(expiryLabel(date, "2026-11-15")).toBe(label);
  });

  it("is null without an expiry date", () => {
    expect(expiryLabel(null, "2026-11-15")).toBeNull();
  });
});
