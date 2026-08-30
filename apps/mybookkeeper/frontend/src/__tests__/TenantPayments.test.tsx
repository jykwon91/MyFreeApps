import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import TenantPayments from "@/app/features/applicants/TenantPayments";
import type { RentLedgerResponse } from "@/shared/types/rent/rent-ledger-response";
import type { Transaction } from "@/shared/types/transaction/transaction";

const mockListTransactions = vi.fn();
const mockGetLedger = vi.fn();

vi.mock("@/shared/store/transactionsApi", () => ({
  useListTransactionsQuery: (...args: unknown[]) => mockListTransactions(...args),
}));

vi.mock("@/shared/store/rentLedgerApi", () => ({
  useGetRentLedgerQuery: (...args: unknown[]) => mockGetLedger(...args),
}));

vi.mock("@/app/features/documents/DocumentViewer", () => ({
  default: () => null,
}));

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: "txn-1",
    amount: "375.00",
    transaction_date: "2026-08-03",
    transaction_type: "income",
    category: "rental_revenue",
    payer_name: "Sonu",
    vendor: null,
    attribution_source: "matched",
    source_document_id: null,
    ...overrides,
  } as Transaction;
}

const LEDGER: RentLedgerResponse = {
  applicant_id: "app-1",
  as_of: "2026-08-20",
  schedules: [],
  charges: [],
  payments: [
    {
      transaction_id: "txn-1",
      paid_on: "2026-08-03",
      amount: "375.00",
      payer_name: "Sonu",
      payment_method: null,
      unapplied: "0.00",
      applied_to: ["August 2026"],
    },
    {
      transaction_id: "txn-2",
      paid_on: "2026-08-31",
      amount: "375.00",
      payer_name: "Sonu",
      payment_method: null,
      unapplied: "375.00",
      applied_to: [],
    },
  ],
  current_period: null,
  total_charged: "1500.00",
  total_paid: "750.00",
  balance: "750.00",
  unapplied_credit: "375.00",
};

function renderPanel() {
  return render(
    <Provider store={store}>
      <TenantPayments applicantId="app-1" />
    </Provider>,
  );
}

describe("TenantPayments", () => {
  beforeEach(() => {
    mockListTransactions.mockReset();
    mockGetLedger.mockReset();
    mockGetLedger.mockReturnValue({ data: LEDGER });
    mockListTransactions.mockReturnValue({
      data: [
        txn({ id: "txn-1" }),
        txn({ id: "txn-2", transaction_date: "2026-08-31" }),
        txn({ id: "txn-3", category: "security_deposit", amount: "500.00" }),
      ],
      isLoading: false,
    });
  });

  it("annotates a rent payment with the period it settled", () => {
    renderPanel();
    const annotations = screen.getAllByTestId("payment-row-rent-applied");
    expect(annotations[0]).toHaveTextContent("Applied to August 2026");
  });

  it("renders the payment's own date, not the day before it", () => {
    // A plain YYYY-MM-DD parsed as UTC renders a day early west of Greenwich,
    // which would show an August 31 payment as August 30 directly above a line
    // saying it settled August. Guard the boundary date specifically.
    renderPanel();
    expect(screen.getByText("Aug 31, 2026")).toBeInTheDocument();
  });

  it("calls out a payment that no charge has consumed as credit", () => {
    renderPanel();
    const annotations = screen.getAllByTestId("payment-row-rent-applied");
    expect(annotations[1]).toHaveTextContent("Held as credit");
  });

  it("leaves a deposit unannotated, since it settles no rent", () => {
    renderPanel();
    // Three payments listed, but only the two rent ones carry an annotation.
    expect(screen.getAllByTestId("payment-row-rent-applied")).toHaveLength(2);
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("still lists payments when the ledger is unavailable", () => {
    mockGetLedger.mockReturnValue({ data: undefined });
    renderPanel();
    expect(screen.getByTestId("tenant-payments-list")).toBeInTheDocument();
    expect(
      screen.queryByTestId("payment-row-rent-applied"),
    ).not.toBeInTheDocument();
  });

  it("shows the skeleton while transactions load", () => {
    mockListTransactions.mockReturnValue({ data: undefined, isLoading: true });
    renderPanel();
    expect(screen.queryByTestId("tenant-payments-list")).not.toBeInTheDocument();
  });
});
