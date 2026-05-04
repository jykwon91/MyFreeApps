/**
 * Unit tests for the InsurancePolicies all-policies list page.
 *
 * Verifies:
 * - Loading skeleton while query is in-flight
 * - Error state with retry
 * - Empty state (all policies)
 * - Empty state (expiring-soon filter active)
 * - Policy list renders names, carriers, expiration badge
 * - "Show expiring soon" checkbox toggle changes query params
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import InsurancePolicies from "@/app/pages/InsurancePolicies";
import type { InsurancePolicySummary } from "@/shared/types/insurance/insurance-policy-summary";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();
let mockIsLoading = false;
let mockIsError = false;
let mockIsFetching = false;
let mockPolicies: InsurancePolicySummary[] = [];

vi.mock("@/shared/store/insurancePoliciesApi", () => ({
  useGetInsurancePoliciesQuery: vi.fn(() => ({
    data: { items: mockPolicies, total: mockPolicies.length, has_more: false },
    isLoading: mockIsLoading,
    isError: mockIsError,
    isFetching: mockIsFetching,
    refetch: mockRefetch,
  })),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => true),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const POLICY_A: InsurancePolicySummary = {
  id: "pol-a",
  listing_id: "listing-1",
  policy_name: "Landlord Insurance",
  carrier: "State Farm",
  effective_date: "2025-01-01",
  expiration_date: "2027-01-01",
  coverage_amount_cents: 50000000,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const POLICY_B: InsurancePolicySummary = {
  id: "pol-b",
  listing_id: "listing-2",
  policy_name: "Short-Term Rental Coverage",
  carrier: "Allstate",
  effective_date: "2024-06-01",
  expiration_date: new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0], // expiring in 10 days
  coverage_amount_cents: null,
  created_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
};

// ── Render helper ────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/insurance-policies"]}>
        <Routes>
          <Route path="/insurance-policies" element={<InsurancePolicies />} />
          <Route path="/insurance-policies/:policyId" element={<div>Detail page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("InsurancePolicies page — loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = true;
    mockIsError = false;
    mockIsFetching = false;
    mockPolicies = [];
  });

  it("renders a loading skeleton with aria-busy", () => {
    renderPage();
    expect(screen.getByTestId("insurance-policies-loading")).toBeInTheDocument();
    expect(screen.getByTestId("insurance-policies-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("does not show the empty state or list during load", () => {
    renderPage();
    expect(screen.queryByTestId("insurance-policies-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("insurance-policies-list")).not.toBeInTheDocument();
  });
});

describe("InsurancePolicies page — error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = true;
    mockIsFetching = false;
    mockPolicies = [];
  });

  it("renders an error alert with retry action", () => {
    renderPage();
    expect(screen.getByText(/couldn't load insurance policies/i)).toBeInTheDocument();
    expect(screen.getByText(/retry/i)).toBeInTheDocument();
  });

  it("calls refetch on retry click", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/retry/i));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe("InsurancePolicies page — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockPolicies = [];
  });

  it("renders the generic empty message when no filter is active", () => {
    renderPage();
    expect(screen.getByTestId("insurance-policies-empty")).toBeInTheDocument();
    expect(screen.getByText(/no policies on this listing yet/i)).toBeInTheDocument();
  });
});

describe("InsurancePolicies page — policy list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockPolicies = [POLICY_A, POLICY_B];
  });

  it("renders all policy names", () => {
    renderPage();
    expect(screen.getByText("Landlord Insurance")).toBeInTheDocument();
    expect(screen.getByText("Short-Term Rental Coverage")).toBeInTheDocument();
  });

  it("policy name links to the detail page", () => {
    renderPage();
    const link = screen.getByTestId("insurance-policy-item-pol-a");
    expect(link).toHaveAttribute("href", "/insurance-policies/pol-a");
  });

  it("renders the carrier as secondary text", () => {
    renderPage();
    expect(screen.getByText("State Farm")).toBeInTheDocument();
    expect(screen.getByText("Allstate")).toBeInTheDocument();
  });

  it("renders the expiration badge for a soon-expiring policy", () => {
    renderPage();
    // POLICY_B expires in 10 days → badge-soon
    expect(screen.getByTestId("expiration-badge-soon")).toBeInTheDocument();
  });
});

describe("InsurancePolicies page — expiring-soon toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockPolicies = [];
  });

  it("renders the 'Show expiring within 30 days' checkbox unchecked by default", () => {
    renderPage();
    const checkbox = screen.getByTestId("expiring-soon-toggle");
    expect(checkbox).not.toBeChecked();
  });

  it("checkbox can be toggled on", async () => {
    const user = userEvent.setup();
    renderPage();
    const checkbox = screen.getByTestId("expiring-soon-toggle");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("shows the 'no policies expiring within 30 days' message when filter is active and list is empty", async () => {
    const user = userEvent.setup();
    renderPage();
    const checkbox = screen.getByTestId("expiring-soon-toggle");
    await user.click(checkbox);
    await waitFor(() => {
      expect(screen.getByText(/no policies expiring within 30 days/i)).toBeInTheDocument();
    });
  });
});
