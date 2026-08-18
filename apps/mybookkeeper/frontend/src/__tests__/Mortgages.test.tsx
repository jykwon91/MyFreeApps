/**
 * Unit tests for the Mortgages list page.
 *
 * Covers the loading skeleton, the error state and its retry, the empty state,
 * and the row itself. The row assertion that matters is the adjustable badge:
 * an ARM cannot be benchmarked against a fixed-rate survey, so a loan that
 * silently drops out of the check below has to say why on its face.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Mortgages from "@/app/pages/Mortgages";
import type { Mortgage } from "@/shared/types/mortgage/mortgage";

const mockRefetch = vi.fn();
let mockIsLoading = false;
let mockIsError = false;
let mockIsFetching = false;
let mockMortgages: Mortgage[] = [];

vi.mock("@/shared/store/mortgagesApi", () => ({
  useGetMortgagesQuery: vi.fn(() => ({
    data: { items: mockMortgages, total: mockMortgages.length, has_more: false },
    isLoading: mockIsLoading,
    isError: mockIsError,
    isFetching: mockIsFetching,
    refetch: mockRefetch,
  })),
  useCreateMortgageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateMortgageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteMortgageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useExtractMortgageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useExtractMortgageFromUploadMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/app/features/mortgages/MortgageRateWatchSection", () => ({
  default: () => <div data-testid="rate-watch-section" />,
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const FIXED: Mortgage = {
  id: "mtg-a",
  user_id: "user-1",
  organization_id: "org-1",
  property_id: "property-1",
  property_name: "6734 Peerless",
  source_document_id: null,
  lender: "TDECU",
  account_number: null,
  current_balance_cents: 33613735,
  statement_date: "2026-08-01",
  original_principal_cents: null,
  interest_rate: "7.125",
  rate_type: "fixed",
  fixed_until: null,
  maturity_date: null,
  term_months: null,
  monthly_principal_cents: 30156,
  monthly_interest_cents: 199582,
  monthly_escrow_cents: 87081,
  notes: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const ADJUSTABLE: Mortgage = {
  ...FIXED,
  id: "mtg-b",
  property_name: "6732 Peerless",
  interest_rate: "8.250",
  rate_type: "arm",
  fixed_until: "2035-02-01",
  current_balance_cents: 28088880,
};

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/mortgages"]}>
        <Mortgages />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Mortgages page — loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = true;
    mockIsError = false;
    mockIsFetching = false;
    mockMortgages = [];
  });

  it("renders a skeleton with aria-busy", () => {
    renderPage();
    const skeleton = screen.getByTestId("mortgages-loading");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute("aria-busy", "true");
  });

  it("mirrors the loaded list's row structure rather than shifting layout", () => {
    renderPage();
    // Three bordered rows, matching what a loaded list renders per loan.
    const rows = screen.getByTestId("mortgages-loading").querySelectorAll(".border");
    expect(rows).toHaveLength(3);
  });

  it("shows neither the empty state nor the list while loading", () => {
    renderPage();
    expect(screen.queryByTestId("mortgages-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mortgages-list")).not.toBeInTheDocument();
  });
});

describe("Mortgages page — error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = true;
    mockIsFetching = false;
    mockMortgages = [];
  });

  it("renders an error alert with a retry action", () => {
    renderPage();
    expect(screen.getByText(/couldn't load mortgages/i)).toBeInTheDocument();
    expect(screen.getByText(/^retry$/i)).toBeInTheDocument();
  });

  it("refetches on retry", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^retry$/i));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe("Mortgages page — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockMortgages = [];
  });

  it("tells the operator what to do next, not just that the list is empty", () => {
    renderPage();
    expect(screen.getByTestId("mortgages-empty")).toBeInTheDocument();
    expect(screen.getByText(/photo of your latest statement/i)).toBeInTheDocument();
  });
});

describe("Mortgages page — loan list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockMortgages = [FIXED, ADJUSTABLE];
  });

  it("renders every loan by its property", () => {
    renderPage();
    expect(screen.getByText("6734 Peerless")).toBeInTheDocument();
    expect(screen.getByText("6732 Peerless")).toBeInTheDocument();
  });

  it("renders the rate to the precision the note was written to", () => {
    renderPage();
    expect(screen.getByTestId("mortgage-rate-mtg-a")).toHaveTextContent("7.125%");
    expect(screen.getByTestId("mortgage-rate-mtg-b")).toHaveTextContent("8.250%");
  });

  it("marks an adjustable loan on its face", () => {
    renderPage();
    expect(screen.getByTestId("mortgage-arm-badge-mtg-b")).toHaveTextContent(
      "Adjustable",
    );
  });

  it("does not mark a fixed loan as adjustable", () => {
    renderPage();
    expect(screen.queryByTestId("mortgage-arm-badge-mtg-a")).not.toBeInTheDocument();
  });

  it("dates the balance, since every figure below is computed from it", () => {
    renderPage();
    expect(screen.getAllByText(/Balance as of Aug 1, 2026/)).toHaveLength(2);
  });

  it("opens the edit dialog from the row", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("mortgage-item-mtg-a"));
    expect(screen.getByTestId("edit-mortgage-dialog")).toBeInTheDocument();
  });
});

describe("Mortgages page — rate watch placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockIsFetching = false;
    mockMortgages = [FIXED];
  });

  it("renders the rate check below the list", () => {
    renderPage();
    const list = screen.getByTestId("mortgages-list");
    const section = screen.getByTestId("rate-watch-section");
    expect(
      list.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens the add dialog", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-mortgage-button"));
    expect(screen.getByTestId("add-mortgage-dialog")).toBeInTheDocument();
  });
});
