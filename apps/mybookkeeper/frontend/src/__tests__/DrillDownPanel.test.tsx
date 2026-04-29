import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import DrillDownPanel from "@/app/features/dashboard/DrillDownPanel";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { DrillDownFilter } from "@/shared/types/dashboard/drill-down-filter";

vi.mock("@/shared/store/transactionsApi", () => ({
  useListTransactionsQuery: vi.fn(),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

import { useListTransactionsQuery } from "@/shared/store/transactionsApi";

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    organization_id: "org-1",
    user_id: "user-1",
    property_id: "prop-1",
    extraction_id: null,
    transaction_date: "2024-06-15",
    tax_year: 2024,
    vendor: "Test Plumber",
    vendor_id: null,
    description: null,
    amount: "500.00",
    transaction_type: "expense",
    category: "contract_work",
    tags: ["contract_work"],
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
    created_at: "2024-06-15T00:00:00Z",
    updated_at: "2024-06-15T00:00:00Z",
    source_document_id: null,
    source_file_name: null,
    linked_document_ids: [],
    external_id: null,
    external_source: null,
    is_pending: false,
    activity_id: null,
    review_reason: null,
    ...overrides,
  };
}

const defaultFilter: DrillDownFilter = {
  category: "contract_work",
  startDate: "2024-06-01",
  endDate: "2024-06-30",
  label: "Contract Work — June 2024",
};

function setupMocks(
  transactions: Transaction[],
  opts: { isLoading?: boolean } = {},
) {
  vi.mocked(useListTransactionsQuery).mockReturnValue({
    data: transactions,
    isLoading: opts.isLoading ?? false,
  } as unknown as ReturnType<typeof useListTransactionsQuery>);
}

describe("DrillDownPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders transaction list with filter label and count", () => {
    const txns = [makeTxn(), makeTxn({ vendor: "Electrician Co" })];
    setupMocks(txns);

    render(
      <Provider store={store}>
        <DrillDownPanel filter={defaultFilter} onClose={vi.fn()} />
      </Provider>,
    );

    expect(screen.getByText("Contract Work — June 2024")).toBeInTheDocument();
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument();
    expect(screen.getByText("Test Plumber")).toBeInTheDocument();
    expect(screen.getByText("Electrician Co")).toBeInTheDocument();
  });

  it("does not show transaction list or empty state while loading", () => {
    setupMocks([], { isLoading: true });

    render(
      <Provider store={store}>
        <DrillDownPanel filter={defaultFilter} onClose={vi.fn()} />
      </Provider>,
    );

    expect(screen.queryByText("No transactions found for this period.")).not.toBeInTheDocument();
    expect(screen.getByText("Contract Work — June 2024")).toBeInTheDocument();
  });

  it("shows empty state when no transactions", () => {
    setupMocks([]);

    render(
      <Provider store={store}>
        <DrillDownPanel filter={defaultFilter} onClose={vi.fn()} />
      </Provider>,
    );

    expect(screen.getByText("No transactions found for this period.")).toBeInTheDocument();
  });

  it("filters transactions by propertyIds when provided", () => {
    const txns = [
      makeTxn({ vendor: "Plumber A", property_id: "prop-1" }),
      makeTxn({ vendor: "Plumber B", property_id: "prop-2" }),
      makeTxn({ vendor: "Plumber C", property_id: "prop-3" }),
    ];
    setupMocks(txns);

    const filterWithPropertyIds: DrillDownFilter = {
      ...defaultFilter,
      propertyIds: ["prop-1", "prop-3"],
    };

    render(
      <Provider store={store}>
        <DrillDownPanel filter={filterWithPropertyIds} onClose={vi.fn()} />
      </Provider>,
    );

    expect(screen.getByText("Plumber A")).toBeInTheDocument();
    expect(screen.queryByText("Plumber B")).not.toBeInTheDocument();
    expect(screen.getByText("Plumber C")).toBeInTheDocument();
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument();
  });

  it("shows all transactions when propertyIds is not provided", () => {
    const txns = [
      makeTxn({ vendor: "Plumber A", property_id: "prop-1" }),
      makeTxn({ vendor: "Plumber B", property_id: "prop-2" }),
    ];
    setupMocks(txns);

    render(
      <Provider store={store}>
        <DrillDownPanel filter={defaultFilter} onClose={vi.fn()} />
      </Provider>,
    );

    expect(screen.getByText("Plumber A")).toBeInTheDocument();
    expect(screen.getByText("Plumber B")).toBeInTheDocument();
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument();
  });

  it("combines type and propertyIds filtering", () => {
    const txns = [
      makeTxn({ vendor: "Revenue Co", property_id: "prop-1", transaction_type: "income" }),
      makeTxn({ vendor: "Expense Co", property_id: "prop-1", transaction_type: "expense" }),
      makeTxn({ vendor: "Other Revenue", property_id: "prop-2", transaction_type: "income" }),
    ];
    setupMocks(txns);

    const filter: DrillDownFilter = {
      label: "Revenue — filtered",
      type: "revenue",
      propertyIds: ["prop-1"],
    };

    render(
      <Provider store={store}>
        <DrillDownPanel filter={filter} onClose={vi.fn()} />
      </Provider>,
    );

    expect(screen.getByText("Revenue Co")).toBeInTheDocument();
    expect(screen.queryByText("Expense Co")).not.toBeInTheDocument();
    expect(screen.queryByText("Other Revenue")).not.toBeInTheDocument();
    expect(screen.getByText(/1 transaction\b/)).toBeInTheDocument();
  });
});
