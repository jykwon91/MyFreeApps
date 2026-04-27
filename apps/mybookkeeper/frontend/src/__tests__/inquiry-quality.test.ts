import { describe, it, expect } from "vitest";
import {
  computeInquiryQualityScore,
  getQualityTier,
} from "@/shared/lib/inquiry-quality";

describe("computeInquiryQualityScore", () => {
  it("returns 0 when no signals are present", () => {
    expect(
      computeInquiryQualityScore({
        desired_start_date: null,
        desired_end_date: null,
        inquirer_employer: null,
        last_message_body: null,
      }),
    ).toBe(0);
  });

  it("scores +1 for each present signal", () => {
    expect(
      computeInquiryQualityScore({
        desired_start_date: "2026-06-01",
        desired_end_date: null,
        inquirer_employer: null,
        last_message_body: null,
      }),
    ).toBe(1);
    expect(
      computeInquiryQualityScore({
        desired_start_date: "2026-06-01",
        desired_end_date: "2026-08-31",
        inquirer_employer: null,
        last_message_body: null,
      }),
    ).toBe(2);
    expect(
      computeInquiryQualityScore({
        desired_start_date: "2026-06-01",
        desired_end_date: "2026-08-31",
        inquirer_employer: "Texas Children's Hospital",
        last_message_body: null,
      }),
    ).toBe(3);
  });

  it("counts a body length > 100 chars as a quality signal", () => {
    const longBody = "a".repeat(101);
    expect(
      computeInquiryQualityScore({
        desired_start_date: "2026-06-01",
        desired_end_date: "2026-08-31",
        inquirer_employer: "Texas Children's Hospital",
        last_message_body: longBody,
      }),
    ).toBe(4);
  });

  it("does NOT count a body of exactly 100 chars", () => {
    // Threshold is strictly greater than 100, mirroring the backend semantics.
    const body100 = "a".repeat(100);
    expect(
      computeInquiryQualityScore({
        desired_start_date: null,
        desired_end_date: null,
        inquirer_employer: null,
        last_message_body: body100,
      }),
    ).toBe(0);
  });

  it("ignores whitespace-only employers", () => {
    expect(
      computeInquiryQualityScore({
        desired_start_date: null,
        desired_end_date: null,
        inquirer_employer: "   ",
        last_message_body: null,
      }),
    ).toBe(0);
  });
});

describe("getQualityTier", () => {
  it("treats 0 and 1 as sparse", () => {
    expect(getQualityTier(0)).toBe("sparse");
    expect(getQualityTier(1)).toBe("sparse");
  });

  it("treats 2 and 3 as standard", () => {
    expect(getQualityTier(2)).toBe("standard");
    expect(getQualityTier(3)).toBe("standard");
  });

  it("treats 4 as complete", () => {
    expect(getQualityTier(4)).toBe("complete");
  });
});
