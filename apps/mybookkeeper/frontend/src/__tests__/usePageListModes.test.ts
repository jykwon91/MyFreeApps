import { describe, it, expect } from "vitest";
import { useVendorsListMode } from "@/app/features/vendors/useVendorsListMode";
import { useListingsListMode } from "@/app/features/listings/useListingsListMode";
import { useTenantsListMode } from "@/app/features/tenants/useTenantsListMode";
import { useLeasesListMode } from "@/app/features/leases/useLeasesListMode";
import { useLeaseTemplatesListMode } from "@/app/features/leases/useLeaseTemplatesListMode";
import { useInsurancePoliciesListMode } from "@/app/features/insurance/useInsurancePoliciesListMode";
import { useInsurancePolicyDetailMode } from "@/app/features/insurance/useInsurancePolicyDetailMode";
import { useInquiriesListMode } from "@/app/features/inquiries/useInquiriesListMode";
import { useInquiryDetailMode } from "@/app/features/inquiries/useInquiryDetailMode";
import type { InsurancePolicyDetail } from "@/shared/types/insurance/insurance-policy-detail";
import type { InquiryResponse } from "@/shared/types/inquiry/inquiry-response";

// ─────────────────────────────────────────────────────────────────────────────
// useVendorsListMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useVendorsListMode", () => {
  it("returns 'loading' when isLoading is true regardless of vendorCount", () => {
    expect(useVendorsListMode({ isLoading: true, isError: false, vendorCount: 0 })).toBe("loading");
    expect(useVendorsListMode({ isLoading: true, isError: false, vendorCount: 5 })).toBe("loading");
  });

  it("returns 'empty' when done loading and count is zero and no error", () => {
    expect(useVendorsListMode({ isLoading: false, isError: false, vendorCount: 0 })).toBe("empty");
  });

  it("returns 'list' when done loading and count is non-zero", () => {
    expect(useVendorsListMode({ isLoading: false, isError: false, vendorCount: 1 })).toBe("list");
    expect(useVendorsListMode({ isLoading: false, isError: false, vendorCount: 10 })).toBe("list");
  });

  it("returns 'list' (not 'empty') when done loading with error and zero count — error shown by parent", () => {
    expect(useVendorsListMode({ isLoading: false, isError: true, vendorCount: 0 })).toBe("list");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useListingsListMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useListingsListMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(useListingsListMode({ isLoading: true, isError: false, listingCount: 0 })).toBe("loading");
  });

  it("returns 'empty' when done and count is zero with no error", () => {
    expect(useListingsListMode({ isLoading: false, isError: false, listingCount: 0 })).toBe("empty");
  });

  it("returns 'list' when count is non-zero", () => {
    expect(useListingsListMode({ isLoading: false, isError: false, listingCount: 3 })).toBe("list");
  });

  it("returns 'list' when error is true (error shown by parent)", () => {
    expect(useListingsListMode({ isLoading: false, isError: true, listingCount: 0 })).toBe("list");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useTenantsListMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useTenantsListMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(useTenantsListMode({ isLoading: true, isError: false, tenantCount: 0 })).toBe("loading");
  });

  it("returns 'empty' when done and count is zero with no error", () => {
    expect(useTenantsListMode({ isLoading: false, isError: false, tenantCount: 0 })).toBe("empty");
  });

  it("returns 'list' when count is non-zero", () => {
    expect(useTenantsListMode({ isLoading: false, isError: false, tenantCount: 2 })).toBe("list");
  });

  it("returns 'list' when error is true (error shown by parent)", () => {
    expect(useTenantsListMode({ isLoading: false, isError: true, tenantCount: 0 })).toBe("list");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useLeasesListMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useLeasesListMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(useLeasesListMode({ isLoading: true, isError: false, leaseCount: 0 })).toBe("loading");
  });

  it("returns 'empty' when done and count is zero with no error", () => {
    expect(useLeasesListMode({ isLoading: false, isError: false, leaseCount: 0 })).toBe("empty");
  });

  it("returns 'list' when count is non-zero", () => {
    expect(useLeasesListMode({ isLoading: false, isError: false, leaseCount: 1 })).toBe("list");
  });

  it("returns 'list' when error is true (error shown by parent)", () => {
    expect(useLeasesListMode({ isLoading: false, isError: true, leaseCount: 0 })).toBe("list");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useLeaseTemplatesListMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useLeaseTemplatesListMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(useLeaseTemplatesListMode({ isLoading: true, isError: false, templateCount: 0 })).toBe("loading");
  });

  it("returns 'empty' when done and count is zero with no error", () => {
    expect(useLeaseTemplatesListMode({ isLoading: false, isError: false, templateCount: 0 })).toBe("empty");
  });

  it("returns 'list' when count is non-zero", () => {
    expect(useLeaseTemplatesListMode({ isLoading: false, isError: false, templateCount: 4 })).toBe("list");
  });

  it("returns 'list' when error is true (error shown by parent)", () => {
    expect(useLeaseTemplatesListMode({ isLoading: false, isError: true, templateCount: 0 })).toBe("list");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useInsurancePoliciesListMode
// (no isError param — the list page does not gate empty on error)
// ─────────────────────────────────────────────────────────────────────────────

describe("useInsurancePoliciesListMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(useInsurancePoliciesListMode({ isLoading: true, policyCount: 0 })).toBe("loading");
    expect(useInsurancePoliciesListMode({ isLoading: true, policyCount: 5 })).toBe("loading");
  });

  it("returns 'empty' when done and count is zero", () => {
    expect(useInsurancePoliciesListMode({ isLoading: false, policyCount: 0 })).toBe("empty");
  });

  it("returns 'list' when done and count is non-zero", () => {
    expect(useInsurancePoliciesListMode({ isLoading: false, policyCount: 1 })).toBe("list");
    expect(useInsurancePoliciesListMode({ isLoading: false, policyCount: 10 })).toBe("list");
  });
});

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
// useInquiriesListMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useInquiriesListMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(useInquiriesListMode({ isLoading: true, isError: false, inquiryCount: 0 })).toBe("loading");
  });

  it("returns 'empty' when done and count is zero with no error", () => {
    expect(useInquiriesListMode({ isLoading: false, isError: false, inquiryCount: 0 })).toBe("empty");
  });

  it("returns 'list' when count is non-zero", () => {
    expect(useInquiriesListMode({ isLoading: false, isError: false, inquiryCount: 7 })).toBe("list");
  });

  it("returns 'list' when error is true (error shown by parent)", () => {
    expect(useInquiriesListMode({ isLoading: false, isError: true, inquiryCount: 0 })).toBe("list");
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
