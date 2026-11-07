import { describe, it, expect } from "vitest";
import { useInsurancePolicyDetailMode } from "@/app/features/insurance/useInsurancePolicyDetailMode";
import { useInquiryDetailMode } from "@/app/features/inquiries/useInquiryDetailMode";
import { useMortgageRateWatchMode } from "@/app/features/mortgages/useMortgageRateWatchMode";
import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";
import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";

// ─────────────────────────────────────────────────────────────────────────────
// useInsurancePolicyDetailMode
// ─────────────────────────────────────────────────────────────────────────────

const stubPolicy = { id: "pol-1" } as InsurancePolicyDetail;

describe("useInsurancePolicyDetailMode", () => {
  it("returns null when isError is true — parent shows AlertBox", () => {
    expect(useInsurancePolicyDetailMode({ isLoading: false, isError: true, policy: undefined })).toBeNull();
    expect(useInsurancePolicyDetailMode({ isLoading: false, isError: true, policy: stubPolicy })).toBeNull();
  });

  it("returns 'loading' when isLoading is true and no error", () => {
    expect(useInsurancePolicyDetailMode({ isLoading: true, isError: false, policy: undefined })).toBe("loading");
    expect(useInsurancePolicyDetailMode({ isLoading: true, isError: false, policy: stubPolicy })).toBe("loading");
  });

  it("returns 'loading' when not loading but policy is undefined", () => {
    expect(useInsurancePolicyDetailMode({ isLoading: false, isError: false, policy: undefined })).toBe("loading");
  });

  it("returns 'content' when not loading, no error, and policy is defined", () => {
    expect(useInsurancePolicyDetailMode({ isLoading: false, isError: false, policy: stubPolicy })).toBe("content");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useInquiryDetailMode
// ─────────────────────────────────────────────────────────────────────────────

const stubInquiry = { id: "inq-1" } as InquiryResponse;

describe("useInquiryDetailMode", () => {
  it("returns null when isError is true — parent shows AlertBox", () => {
    expect(useInquiryDetailMode({ isLoading: false, isError: true, inquiry: undefined })).toBeNull();
    expect(useInquiryDetailMode({ isLoading: false, isError: true, inquiry: stubInquiry })).toBeNull();
  });

  it("returns 'loading' when isLoading is true and no error", () => {
    expect(useInquiryDetailMode({ isLoading: true, isError: false, inquiry: undefined })).toBe("loading");
    expect(useInquiryDetailMode({ isLoading: true, isError: false, inquiry: stubInquiry })).toBe("loading");
  });

  it("returns 'loading' when not loading but inquiry is undefined", () => {
    expect(useInquiryDetailMode({ isLoading: false, isError: false, inquiry: undefined })).toBe("loading");
  });

  it("returns 'content' when not loading, no error, and inquiry is defined", () => {
    expect(useInquiryDetailMode({ isLoading: false, isError: false, inquiry: stubInquiry })).toBe("content");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useMortgageRateWatchMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useMortgageRateWatchMode", () => {
  it("returns 'idle' before the operator has asked for a check", () => {
    // The check reaches an external service, so an unchecked section must not
    // render as loading — nothing is in flight.
    expect(
      useMortgageRateWatchMode({
        hasChecked: false,
        isFetching: false,
        isError: false,
        outlookCount: 0,
      }),
    ).toBe("idle");
  });

  it("returns 'loading' while fetching, even on the first check", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: false,
        isFetching: true,
        isError: false,
        outlookCount: 0,
      }),
    ).toBe("loading");
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: true,
        isError: false,
        outlookCount: 2,
      }),
    ).toBe("loading");
  });

  it("returns 'error' when a completed check failed", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: false,
        isError: true,
        outlookCount: 0,
      }),
    ).toBe("error");
  });

  it("returns 'empty' when the check ran and there were no loans to compare", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: false,
        isError: false,
        outlookCount: 0,
      }),
    ).toBe("empty");
  });

  it("returns 'results' once a successful check produced outlooks", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: false,
        isError: false,
        outlookCount: 2,
      }),
    ).toBe("results");
  });
});
