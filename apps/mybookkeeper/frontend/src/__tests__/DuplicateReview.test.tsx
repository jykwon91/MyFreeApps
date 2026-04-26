import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Transactions from "@/app/pages/Transactions";
import type { DuplicatePairsResponse } from "@/shared/types/transaction/duplicate";
import type { Property } from "@/shared/types/property/property";

const mockDuplicateData: DuplicatePairsResponse = {
  pairs: [
    {
      id: "txn-1_txn-2",
      transaction_a: {
        id: "txn-1",
        transaction_date: "2025-06-15",
        vendor: "Home Depot",
        description: "Plumbing supplies",
        amount: "250.00",
        transaction_type: "expense",
        category: "maintenance",
        property_id: "prop-1",
        payment_method: null,
        channel: null,
        tags: [],
        status: "approved",
        source_document_id: "doc-1",
        source_file_name: "invoice_june.pdf",
        is_manual: false,
        created_at: "2025-06-15T10:00:00Z",
        linked_document_ids: [],
      },
      transaction_b: {
        id: "txn-2",
        transaction_date: "2025-06-18",
        vendor: "Home Depot",
        description: "Plumbing supplies",
        amount: "250.00",
        transaction_type: "expense",
        category: "maintenance",
        property_id: "prop-1",
        payment_method: null,
        channel: null,
        tags: [],
        status: "pending",
        source_document_id: "doc-2",
        source_file_name: "bank_import.csv",
        is_manual: false,
        created_at: "2025-06-18T10:00:00Z",
        linked_document_ids: [],
      },
      date_diff_days: 3,
      property_match: true,
      confidence: "medium",
    },
  ],
  total: 1,
};

const emptyData: DuplicatePairsResponse = { pairs: [], total: 0 };

const mockProperties: Property[] = [
  {
    id: "prop-1",
    name: "123 Main St",
    address: "123 Main St, Portland, OR 97201",
    classification: "investment",
    type: "short_term",
    is_active: true,
    activity_periods: [],
    created_at: "2025-01-01T00:00:00Z",
  },
];

vi.mock("@/shared/store/transactionsApi", async () => {
  const actual = await vi.importActual("@/shared/store/transactionsApi");
  return {
    ...actual,
    useListTransactionsQuery: vi.fn(() => ({ data: [], isLoading: false })),
    useGetDuplicatesQuery: vi.fn(() => ({ data: mockDuplicateData, isLoading: false })),
    useKeepDuplicateMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useDismissDuplicateMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useMergeDuplicatesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useBulkApproveTransactionsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useBulkDeleteTransactionsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useUpdateTransactionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useDeleteTransactionMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  };
});

vi.mock("@/shared/store/propertiesApi", async () => {
  const actual = await vi.importActual("@/shared/store/propertiesApi");
  return {
    ...actual,
    useGetPropertiesQuery: vi.fn(() => ({ data: mockProperties, isLoading: false })),
  };
});

import {
  useGetDuplicatesQuery,
  useListTransactionsQuery,
  useKeepDuplicateMutation,
  useDismissDuplicateMutation,
  useMergeDuplicatesMutation,
} from "@/shared/store/transactionsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/transactions?tab=duplicates"]}>
        <Transactions />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Duplicates tab on Transactions page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListTransactionsQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useListTransactionsQuery>);
    vi.mocked(useGetDuplicatesQuery).mockReturnValue({
      data: mockDuplicateData,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetDuplicatesQuery>);
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: mockProperties,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);
    vi.mocked(useKeepDuplicateMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useKeepDuplicateMutation>);
    vi.mocked(useDismissDuplicateMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useDismissDuplicateMutation>);
    vi.mocked(useMergeDuplicatesMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useMergeDuplicatesMutation>);
  });

  it("renders Transactions title and tab bar", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    const dupTabs = screen.getAllByRole("button", { name: /Duplicates/ });
    expect(dupTabs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders duplicate pair card with transaction details", () => {
    renderPage();
    expect(screen.getByText("Same amount, 3 days apart")).toBeInTheDocument();
    expect(screen.getAllByText("Home Depot")).toHaveLength(2);
    expect(screen.getByText("invoice_june.pdf")).toBeInTheDocument();
    expect(screen.getByText("bank_import.csv")).toBeInTheDocument();
  });

  it("renders both amount displays", () => {
    renderPage();
    const amounts = screen.getAllByText("$250.00");
    expect(amounts).toHaveLength(2);
  });

  it("renders Merge and Not Duplicates action buttons", () => {
    renderPage();
    expect(screen.getByText("Merge")).toBeInTheDocument();
    expect(screen.getByText("Not Duplicates")).toBeInTheDocument();
  });

  it("does not render Keep A / Keep B buttons", () => {
    renderPage();
    expect(screen.queryByText(/Keep Invoice/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Keep Bank/)).not.toBeInTheDocument();
  });

  it("shows property names from property map", () => {
    renderPage();
    expect(screen.getAllByText("123 Main St")).toHaveLength(2);
  });

  it("shows transaction status badges", () => {
    renderPage();
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("shows empty state when no duplicates", () => {
    vi.mocked(useGetDuplicatesQuery).mockReturnValue({
      data: emptyData,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetDuplicatesQuery>);

    renderPage();
    expect(screen.getByText(/No suspected duplicates right now/)).toBeInTheDocument();
  });

  it("hides transaction-only actions on duplicates tab", () => {
    renderPage();
    expect(screen.queryByText("Add Transaction")).not.toBeInTheDocument();
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
    expect(screen.queryByText("Export")).not.toBeInTheDocument();
  });
});
