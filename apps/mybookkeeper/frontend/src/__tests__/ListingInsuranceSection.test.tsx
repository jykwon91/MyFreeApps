/**
 * Unit tests for ListingInsuranceSection.
 *
 * Verifies:
 * - Loading skeleton while query is in-flight
 * - Error state when query fails
 * - Empty state when no policies exist for the listing
 * - Policy list when data is returned
 * - "Add policy" button shown only when canWrite=true
 * - "Add policy" button hidden when canWrite=false
 * - ExpiratingBadge is rendered for policies with expiration_date
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ListingInsuranceSection from "@/app/features/insurance/ListingInsuranceSection";
import type { InsurancePolicySummary } from "@/shared/types/insurance/insurance-policy-summary";

// Mock the API hook
let mockIsLoading = false;
let mockIsError = false;
let mockPolicies: InsurancePolicySummary[] = [];

vi.mock("@/shared/store/insurancePoliciesApi", () => ({
  useGetInsurancePoliciesQuery: vi.fn(() => ({
    data: { items: mockPolicies, total: mockPolicies.length, has_more: false },
    isLoading: mockIsLoading,
    isError: mockIsError,
  })),
  useCreateInsurancePolicyMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    { isLoading: false },
  ]),
}));

const POLICY_ACTIVE: InsurancePolicySummary = {
  id: "policy-1",
  listing_id: "listing-1",
  policy_name: "Landlord Insurance",
  carrier: "State Farm",
  effective_date: "2025-01-01",
  expiration_date: "2026-12-31",
  coverage_amount_cents: 50000000,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const POLICY_EXPIRING_SOON: InsurancePolicySummary = {
  id: "policy-2",
  listing_id: "listing-1",
  policy_name: "Short-Term Rental Coverage",
  carrier: "Allstate",
  effective_date: "2025-06-01",
  expiration_date: new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0],
  coverage_amount_cents: null,
  created_at: "2025-06-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
};

function renderSection(overrides: { canWrite?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <ListingInsuranceSection
        listingId="listing-1"
        canWrite={overrides.canWrite ?? true}
      />
    </MemoryRouter>,
  );
}

describe("ListingInsuranceSection — loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = true;
    mockIsError = false;
    mockPolicies = [];
  });

  it("renders a loading skeleton with aria-busy", () => {
    renderSection();
    expect(screen.getByTestId("listing-insurance-loading")).toBeInTheDocument();
    expect(screen.getByTestId("listing-insurance-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("does not render the policy list or empty state while loading", () => {
    renderSection();
    expect(screen.queryByTestId("listing-insurance-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("listing-insurance-empty")).not.toBeInTheDocument();
  });
});

describe("ListingInsuranceSection — error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = true;
    mockPolicies = [];
  });

  it("renders the error message", () => {
    renderSection();
    expect(screen.getByTestId("listing-insurance-error")).toBeInTheDocument();
    expect(screen.getByText(/couldn't load insurance policies/i)).toBeInTheDocument();
  });
});

describe("ListingInsuranceSection — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockPolicies = [];
  });

  it("renders the empty state message when no policies", () => {
    renderSection();
    expect(screen.getByTestId("listing-insurance-empty")).toBeInTheDocument();
    expect(screen.getByText(/no policies on this listing yet/i)).toBeInTheDocument();
  });

  it("does not render the list", () => {
    renderSection();
    expect(screen.queryByTestId("listing-insurance-list")).not.toBeInTheDocument();
  });
});

describe("ListingInsuranceSection — policy list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockPolicies = [POLICY_ACTIVE, POLICY_EXPIRING_SOON];
  });

  it("renders all policy names", () => {
    renderSection();
    expect(screen.getByText("Landlord Insurance")).toBeInTheDocument();
    expect(screen.getByText("Short-Term Rental Coverage")).toBeInTheDocument();
  });

  it("renders carrier names as secondary text", () => {
    renderSection();
    expect(screen.getByText("State Farm")).toBeInTheDocument();
    expect(screen.getByText("Allstate")).toBeInTheDocument();
  });

  it("policy name is a link to the detail page", () => {
    renderSection();
    const link = screen.getByTestId("insurance-policy-link-policy-1");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/insurance-policies/policy-1");
  });

  it("renders the expiration badge for expiring-soon policy", () => {
    renderSection();
    // The expiring-soon policy has expiry within 10 days → badge-soon
    expect(screen.getByTestId("expiration-badge-soon")).toBeInTheDocument();
  });
});

describe("ListingInsuranceSection — Add policy button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockPolicies = [];
  });

  it("renders the 'Add policy' button when canWrite=true", () => {
    renderSection({ canWrite: true });
    expect(screen.getByTestId("add-insurance-policy-button")).toBeInTheDocument();
  });

  it("does not render the 'Add policy' button when canWrite=false", () => {
    renderSection({ canWrite: false });
    expect(screen.queryByTestId("add-insurance-policy-button")).not.toBeInTheDocument();
  });

  it("opens AddInsurancePolicyDialog on button click", async () => {
    const user = userEvent.setup();
    renderSection({ canWrite: true });
    await user.click(screen.getByTestId("add-insurance-policy-button"));
    // Dialog is rendered — look for a recognizable element inside it
    await waitFor(() => {
      expect(screen.getByTestId("add-insurance-policy-dialog")).toBeInTheDocument();
    });
  });
});
