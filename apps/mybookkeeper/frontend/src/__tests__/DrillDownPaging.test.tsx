import { forwardRef, useImperativeHandle } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import DrillDownPanel from "@/app/features/dashboard/DrillDownPanel";
import { DRILL_DOWN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/transactionPaging";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";

vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useListTransactionsQuery: vi.fn(),
}));

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/app/features/transactions/TransactionPanel", () => ({
  default: forwardRef<{ requestClose: (after: () => void) => void }, { transaction: Transaction }>(
    function TransactionPanelStub({ transaction }, ref) {
      useImperativeHandle(ref, () => ({ requestClose: (after) => after() }));
      return <div data-testid="detail">Detail of {transaction.vendor}</div>;
    },
  ),
}));

import { useListTransactionsQuery } from "@mybookkeeper/api-client/store/transactionsApi";

const TOTAL_ROWS = DRILL_DOWN_PAGE_SIZE * 2 + 30;

function makeRows(count: number): Transaction[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `txn-${i}`,
    vendor: `Vendor ${i}`,
    amount: "10.00",
    category: "contract_work",
    property_id: "prop-1",
    transaction_date: "2024-06-15",
    description: null,
    source_document_id: null,
  }) as unknown as Transaction);
}

const filter: DrillDownFilter = { category: "contract_work", label: "Contract Work" };

function setRows(rows: Transaction[]) {
  vi.mocked(useListTransactionsQuery).mockReturnValue({
    data: rows,
    isLoading: false,
  } as unknown as ReturnType<typeof useListTransactionsQuery>);
}

function renderPanel(f: DrillDownFilter = filter) {
  const ui = (value: DrillDownFilter) => (
    <Provider store={store}>
      <DrillDownPanel filter={value} onClose={vi.fn()} />
    </Provider>
  );
  const view = render(ui(f));
  return { ...view, rerenderWith: (value: DrillDownFilter) => view.rerender(ui(value)) };
}

// Text lookups, not role+name queries: computing accessible names over hundreds of rows is slow in jsdom.
const drawnRows = () => screen.getAllByText(/^Vendor \d+$/);
const showMore = (count: number) => screen.getByText(`Show ${count} more`);
const queryShowMore = () => screen.queryByText(/^Show \d+ more$/);

describe("DrillDownPanel paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRows(makeRows(TOTAL_ROWS));
  });

  it("draws only the first page", () => {
    renderPanel();
    expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE);
    expect(screen.queryByText(`Vendor ${DRILL_DOWN_PAGE_SIZE}`)).not.toBeInTheDocument();
  });

  it("Show more reveals the next page and names how many it will add", async () => {
    renderPanel();
    fireEvent.click(showMore(DRILL_DOWN_PAGE_SIZE));
    expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE * 2);
    fireEvent.click(showMore(30));
    expect(drawnRows()).toHaveLength(TOTAL_ROWS);
    expect(queryShowMore()).not.toBeInTheDocument();
  });

  it("does not offer Show more when everything fits on one page", () => {
    setRows(makeRows(3));
    renderPanel();
    expect(queryShowMore()).not.toBeInTheDocument();
  });

  it("counts and totals every filtered row, not just the drawn page", () => {
    renderPanel();
    expect(screen.getByText(new RegExp(`${TOTAL_ROWS} transactions`))).toBeInTheDocument();
    expect(screen.getByText(/\$2,300\.00/)).toBeInTheDocument();
  });

  it("goes back to the first page when the filter changes", () => {
    const { rerenderWith } = renderPanel();
    fireEvent.click(showMore(DRILL_DOWN_PAGE_SIZE));
    expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE * 2);
    rerenderWith({ ...filter, label: "Other", startDate: "2024-07-01" });
    expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE);
  });

  it("keeps how many rows were shown after coming back from the detail view", () => {
    renderPanel();
    fireEvent.click(showMore(DRILL_DOWN_PAGE_SIZE));
    fireEvent.click(screen.getByText("Vendor 150"));
    expect(screen.getByTestId("detail")).toHaveTextContent("Vendor 150");
    fireEvent.click(screen.getByTitle("Back to list"));
    expect(drawnRows()).toHaveLength(DRILL_DOWN_PAGE_SIZE * 2);
  });

  it("opens a row from the keyboard", async () => {
    renderPanel();
    const row = screen.getByText("Vendor 2").closest("button");
    expect(row).not.toBeNull();
    row?.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("detail")).toHaveTextContent("Vendor 2");
  });
});
