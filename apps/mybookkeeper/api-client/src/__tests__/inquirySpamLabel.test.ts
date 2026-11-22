import { describe, it, expect } from "vitest";
import { inquirySpamLabel } from "../utils/inquirySpamLabel";

describe("inquirySpamLabel", () => {
  it("shows the rounded score for flagged and clean", () => {
    expect(inquirySpamLabel("flagged", 42)).toBe("Flagged · 42");
    expect(inquirySpamLabel("flagged", 41.6)).toBe("Flagged · 42");
    expect(inquirySpamLabel("clean", 85)).toBe("Clean · 85");
  });

  it("shows a score of zero", () => {
    expect(inquirySpamLabel("flagged", 0)).toBe("Flagged · 0");
  });

  it("shows the bare word when there is no score", () => {
    expect(inquirySpamLabel("flagged", null)).toBe("Flagged");
    expect(inquirySpamLabel("clean", null)).toBe("Clean");
  });

  it("never shows a score for the other statuses", () => {
    expect(inquirySpamLabel("spam", 15)).toBe("Spam");
    expect(inquirySpamLabel("manually_cleared", 10)).toBe("Cleared");
    expect(inquirySpamLabel("unscored", null)).toBe("Unscored");
  });
});
