/**
 * Unit tests for the InsurancePolicyDetail page.
 *
 * Verifies:
 * - Skeleton rendered while loading
 * - Error state with retry
 * - Policy details display (policy number, coverage, dates, notes)
 * - Expiration badge rendered
 * - Delete button visibility gated on canWrite
 * - Delete confirm dialog + successful delete navigates away
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import InsurancePolicyDetail from "@/app/pages/InsurancePolicyDetail";
import type { InsurancePolicyDetail as PolicyDetailType } from "@/shared/types/insurance/insurance-policy-detail";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();
let mockIsLoading = false;
let mockIsError = false;
let mockIsFetching = false;
let mockPolicy: PolicyDetailType | undefined;

const deleteMock = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }));
let mockIsDeleting = false;

vi.mock("@/shared/store/insurancePoliciesApi", () => ({
  useGetInsurancePolicyByIdQuery: vi.fn(() => ({
    data: mockPolicy,
    isLoading: mockIsLoading,
    isError: mockIsError,
    isFetching: mockIsFetching,
    refetch: mockRefetch,
  })),
  useDeleteInsurancePolicyMutation: vi.fn(() => [deleteMock, { isLoading: mockIsDeleting }]),
  useUploadInsurancePolicyAttachmentMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteInsurancePolicyAttachmentMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })),
    { isLoading: false },
  ]),
}));

let mockCanWrite = true;
vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => mockCanWrite),
}));

const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();
vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showErrorMock(msg),
  showSuccess: (msg: string) => showSuccessMock(msg),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const POLICY: PolicyDetailType = {
  id: "policy-abc",
  user_id: "user-1",
  organization_id: "org-1",
  listing_id: "listing-1",
  policy_name: "Landlord Insurance",
  carrier: "State Farm",
  policy_number: "POL-12345",
  effective_date: "2025-01-01",
  expiration_date: "2026-01-01",
  coverage_amount_cents: 50000000,
  notes: "Annual renewal reminder set.",
  attachments: [],
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// ── Render helper ─────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/insurance-policies/policy-abc"]}>
        <Routes>
          <Route
            path="/insurance-policies/:policyId"
            element={<InsurancePolicyDetail />}
          />
          <Route
            path="/insurance-policies"
            element={<div data-testid="insurance-policies-page">All Policies</div>}
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InsurancePolicyDetail — loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = true;
    mockIsError = false;
    mockIsFetching = false;
    mockPolicy = undefined;
    mockCanWrite = true;
  });

  it("renders the skeleton while loading", () => {
    renderPage();
    expect(screen.getByTestId("insurance-policy-detail-skeleton")).toBeInTheDocument();
  });

  it("does not render policy details while loading", () => {
    renderPage();
    expect(screen.queryByTestId("insurance-policy-details")).not.toBeInTheDocument();
  });
});

describe("InsurancePolicyDetail — error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = true;
    mockIsFetching = false;
    mockPolicy = undefined;
    mockCanWrite = true;
  });

  it("renders the error alert", () => {
    renderPage();
    expect(screen.getByText(/couldn't load this policy/i)).toBeInTheDocument();
  });

  it("retry button calls refetch", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe("InsurancePolicyDetail — loaded state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockPolicy = POLICY;
    mockCanWrite = true;
  });

  it("renders the policy name as the page title", () => {
    renderPage();
    expect(screen.getByText("Landlord Insurance")).toBeInTheDocument();
  });

  it("renders the carrier name", () => {
    renderPage();
    expect(screen.getByText("State Farm")).toBeInTheDocument();
  });

  it("renders the policy number", () => {
    renderPage();
    expect(screen.getByTestId("insurance-policy-number")).toHaveTextContent("POL-12345");
  });

  it("formats coverage amount from cents to USD", () => {
    renderPage();
    // $500,000 from 50000000 cents
    expect(screen.getByTestId("insurance-coverage-amount")).toHaveTextContent("$500,000");
  });

  it("formats effective and expiration dates as MM/DD/YYYY", () => {
    renderPage();
    expect(screen.getByTestId("insurance-effective-date")).toHaveTextContent("01/01/2025");
    expect(screen.getByTestId("insurance-expiration-date")).toHaveTextContent("01/01/2026");
  });

  it("renders notes when present", () => {
    renderPage();
    expect(screen.getByTestId("insurance-notes")).toHaveTextContent(
      "Annual renewal reminder set.",
    );
  });

  it("renders 'Back to insurance policies' navigation link", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /back to insurance policies/i });
    expect(link).toHaveAttribute("href", "/insurance-policies");
  });
});

describe("InsurancePolicyDetail — delete flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockPolicy = POLICY;
    mockCanWrite = true;
    mockIsDeleting = false;
  });

  it("shows the Delete button when canWrite=true", () => {
    renderPage();
    expect(screen.getByTestId("delete-insurance-policy-button")).toBeInTheDocument();
  });

  it("does not show the Delete button when canWrite=false", () => {
    mockCanWrite = false;
    renderPage();
    expect(screen.queryByTestId("delete-insurance-policy-button")).not.toBeInTheDocument();
  });

  it("clicking Delete opens the confirm dialog", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("delete-insurance-policy-button"));
    expect(screen.getByTestId("delete-insurance-policy-confirm")).toBeInTheDocument();
  });

  it("Cancel dismisses the confirm dialog without deleting", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("delete-insurance-policy-button"));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("delete-insurance-policy-confirm")).not.toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("confirms delete, calls mutation, shows success toast, navigates to list", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("delete-insurance-policy-button"));
    await user.click(screen.getByTestId("confirm-delete-insurance-policy"));
    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith("policy-abc");
    });
    await waitFor(() => {
      expect(showSuccessMock).toHaveBeenCalledWith("Insurance policy deleted.");
    });
    await waitFor(() => {
      expect(screen.getByTestId("insurance-policies-page")).toBeInTheDocument();
    });
  });
});

describe("InsurancePolicyDetail — coverage edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockCanWrite = true;
  });

  it("shows '—' when coverage_amount_cents is null", () => {
    mockPolicy = { ...POLICY, coverage_amount_cents: null };
    renderPage();
    expect(screen.getByTestId("insurance-coverage-amount")).toHaveTextContent("—");
  });

  it("shows '—' for effective_date when null", () => {
    mockPolicy = { ...POLICY, effective_date: null };
    renderPage();
    expect(screen.getByTestId("insurance-effective-date")).toHaveTextContent("—");
  });

  it("does not render notes section when notes is null", () => {
    mockPolicy = { ...POLICY, notes: null };
    renderPage();
    expect(screen.queryByTestId("insurance-notes")).not.toBeInTheDocument();
  });
});
