import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Transactions from "@/app/pages/Transactions";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { Property } from "@/shared/types/property/property";

const mockTransactions: Transaction[] = [
  {
    id: "txn-1",
    organization_id: "org-1",
    user_id: "user-1",
    property_id: "prop-1",
    extraction_id: null,
    vendor_id: null,
    transaction_date: "2025-03-01",
    tax_year: 2025,
    vendor: "Home Depot",
    description: "Plumbing supplies",
    amount: "250.00",
    transaction_type: "expense",
    category: "repairs",
    tags: ["maintenance"],
    tax_relevant: true,
    schedule_e_line: null,
    is_capital_improvement: false,
    placed_in_service_date: null,
    channel: null,
    address: null,
    payment_method: null,
    status: "pending",
    review_fields: null,
    reconciled: false,
    reconciled_at: null,
    is_manual: false,
    deleted_at: null,
    created_at: "2025-03-01T00:00:00Z",
    updated_at: "2025-03-01T00:00:00Z",
    source_document_id: null,
    source_file_name: null,
    linked_document_ids: [],
    external_id: null,
    external_source: null,
    is_pending: false,
    activity_id: null,
    review_reason: null,
    applicant_id: null,
    attribution_source: null,
    payer_name: null,
  },
  {
    id: "txn-2",
    organization_id: "org-1",
    user_id: "user-1",
    property_id: "prop-1",
    extraction_id: null,
    vendor_id: null,
    transaction_date: "2025-03-05",
    tax_year: 2025,
    vendor: "Tenant Rent",
    description: "March rent",
    amount: "1500.00",
    transaction_type: "income",
    category: "rental_revenue",
    tags: [],
    tax_relevant: true,
    schedule_e_line: null,
    is_capital_improvement: false,
    placed_in_service_date: null,
    channel: null,
    address: null,
    payment_method: null,
    status: "approved",
    review_fields: null,
    reconciled: false,
    reconciled_at: null,
    is_manual: false,
    deleted_at: null,
    created_at: "2025-03-05T00:00:00Z",
    updated_at: "2025-03-05T00:00:00Z",
    source_document_id: null,
    source_file_name: null,
    linked_document_ids: [],
    external_id: null,
    external_source: null,
    is_pending: false,
    activity_id: null,
    review_reason: null,
    applicant_id: null,
    attribution_source: null,
    payer_name: null,
  },
];

const mockProperties: Property[] = [
  {
    id: "prop-1",
    name: "Beach House",
    address: "123 Ocean Dr",
    classification: "investment",
    type: "short_term",
    is_active: true,
    activity_periods: [],
    created_at: "2024-01-01T00:00:00Z",
  },
];

vi.mock("@/shared/store/transactionsApi", () => ({
  useListTransactionsQuery: vi.fn(() => ({
    data: mockTransactions,
    isLoading: false,
  })),
  useGetDuplicatesQuery: vi.fn(() => ({ data: { pairs: [], total: 0 }, isLoading: false })),
  useCreateTransactionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useBulkApproveTransactionsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useBulkDeleteTransactionsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateTransactionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteTransactionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useKeepDuplicateMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDismissDuplicateMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useMergeDuplicatesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({
    data: mockProperties,
    isLoading: false,
  })),
}));

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantsQuery: vi.fn(() => ({
    data: { items: [], total: 0, has_more: false },
    isLoading: false,
  })),
}));

vi.mock("@/shared/store/attributionApi", () => ({
  useGetAttributionReviewQueueQuery: vi.fn(() => ({
    data: { items: [], total: 0, pending_count: 0 },
    isLoading: false,
  })),
  useAttributeTransactionManuallyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useConfirmAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRejectAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetPropertyPnlQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock("@/shared/utils/download", () => ({
  downloadFile: vi.fn(),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => true),
}));

import { useListTransactionsQuery } from "@/shared/store/transactionsApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("Transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListTransactionsQuery).mockReturnValue({
      data: mockTransactions,
      isLoading: false,
    } as unknown as ReturnType<typeof useListTransactionsQuery>);
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  it("renders the page title", () => {
    renderWithProviders(<Transactions />);

    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
  });

  it("renders Add Transaction button", () => {
    renderWithProviders(<Transactions />);

    expect(screen.getByText("Add Transaction")).toBeInTheDocument();
  });

  it("renders Export dropdown button", () => {
    renderWithProviders(<Transactions />);

    expect(screen.getByText("Export")).toBeInTheDocument();
  });

  it("renders Import button", () => {
    renderWithProviders(<Transactions />);

    expect(screen.getByText("Import")).toBeInTheDocument();
  });

  it("shows export options when Export is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Transactions />);

    await user.click(screen.getByText("Export"));

    expect(screen.getByText("Export CSV")).toBeInTheDocument();
    expect(screen.getByText("Export PDF")).toBeInTheDocument();
  });

  it("renders transaction data in the table", () => {
    renderWithProviders(<Transactions />);

    expect(screen.getByText("Home Depot")).toBeInTheDocument();
    expect(screen.getByText("Tenant Rent")).toBeInTheDocument();
  });

  it("renders filter bar with select elements", () => {
    renderWithProviders(<Transactions />);

    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it("renders checkboxes for bulk selection", () => {
    renderWithProviders(<Transactions />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows bulk bar when a checkbox is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Transactions />);

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    expect(screen.getByText(/selected/i)).toBeInTheDocument();
  });

  it("opens manual entry form when Add Transaction is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Transactions />);

    await user.click(screen.getByText("Add Transaction"));

    expect(screen.getByText("New Transaction")).toBeInTheDocument();
  });

  it("shows info banner when not dismissed", () => {
    localStorage.removeItem("txn-info-dismissed");
    renderWithProviders(<Transactions />);

    expect(screen.getByText(/Transactions are extracted automatically/)).toBeInTheDocument();
  });

  it("hides info banner when dismissed in localStorage", () => {
    localStorage.setItem("txn-info-dismissed", "1");
    renderWithProviders(<Transactions />);

    expect(screen.queryByText(/Transactions are extracted automatically/)).not.toBeInTheDocument();
  });

  it("dismisses info banner on click", async () => {
    localStorage.removeItem("txn-info-dismissed");
    const user = userEvent.setup();
    renderWithProviders(<Transactions />);

    expect(screen.getByText(/Transactions are extracted automatically/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Dismiss"));

    expect(screen.queryByText(/Transactions are extracted automatically/)).not.toBeInTheDocument();
    expect(localStorage.getItem("txn-info-dismissed")).toBe("1");
  });

  it("shows Vendor Rules button with tooltip", () => {
    renderWithProviders(<Transactions />);

    const vendorRulesBtn = screen.getByText("Vendor Rules").closest("button");
    expect(vendorRulesBtn).toHaveAttribute("title", "Rules I've learned from your corrections — click to view or manage them");
  });

  it("shows Import button with tooltip", () => {
    renderWithProviders(<Transactions />);

    const importBtn = screen.getByText("Import").closest("button");
    expect(importBtn).toHaveAttribute("title", "Import transactions from a bank CSV file");
  });

  it("shows skeleton loader when loading", () => {
    vi.mocked(useListTransactionsQuery).mockReturnValue({
      data: [],
      isLoading: true,
    } as unknown as ReturnType<typeof useListTransactionsQuery>);

    const { container } = renderWithProviders(<Transactions />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Transactions — viewer role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListTransactionsQuery).mockReturnValue({
      data: mockTransactions,
      isLoading: false,
    } as unknown as ReturnType<typeof useListTransactionsQuery>);
    vi.mocked(useCanWrite).mockReturnValue(false);
  });

  afterEach(() => {
    localStorage.removeItem("txn-info-dismissed");
  });

  it("hides Add Transaction button for viewer", () => {
    renderWithProviders(<Transactions />);

    const addBtn = screen.getByTitle("You have read-only access");
    expect(addBtn).toBeDisabled();
  });

  it("hides Import button for viewer", () => {
    renderWithProviders(<Transactions />);

    expect(screen.queryByText("Import")).not.toBeInTheDocument();
  });

  it("hides Vendor Rules button for viewer", () => {
    renderWithProviders(<Transactions />);

    expect(screen.queryByText("Vendor Rules")).not.toBeInTheDocument();
  });

  it("still shows Export dropdown for viewer", () => {
    renderWithProviders(<Transactions />);

    expect(screen.getByText("Export")).toBeInTheDocument();
  });
});
