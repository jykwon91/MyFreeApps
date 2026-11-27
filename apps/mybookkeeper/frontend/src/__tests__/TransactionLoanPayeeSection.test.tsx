import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TransactionLoanPayeeSection from "@/app/features/loan-payee/TransactionLoanPayeeSection";
import { LOAN_PAYEE_LABELS as L } from "@mybookkeeper/api-client/constants/loanPayeeLabels";
import type { LoanPayee } from "@mybookkeeper/api-client/types/loan-payee/loan-payee";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

vi.mock("@mybookkeeper/api-client/store/loanPayeeApi", () => ({
  useGetLoanPayeeQuery: vi.fn(),
  useTagLoanPayeeMutation: vi.fn(),
  useUntagLoanPayeeMutation: vi.fn(),
}));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import { showError, showSuccess } from "@platform/ui";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import {
  useGetLoanPayeeQuery,
  useTagLoanPayeeMutation,
  useUntagLoanPayeeMutation,
} from "@mybookkeeper/api-client/store/loanPayeeApi";

const PAYEE = "Pat Doe External F";
let tagTrigger: ReturnType<typeof vi.fn>;
let untagTrigger: ReturnType<typeof vi.fn>;

function txn(type: TransactionType = "expense", status: TransactionStatus = "approved"): Transaction {
  return { id: "txn-1", transaction_type: type, status } as Transaction;
}

function loaded(payee: Partial<LoanPayee>, extra: { isLoading?: boolean; isError?: boolean } = {}) {
  vi.mocked(useGetLoanPayeeQuery).mockReturnValue({
    data: { payee: PAYEE, kind: null, can_tag: true, ...payee },
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useGetLoanPayeeQuery>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCanWrite).mockReturnValue(true);
  tagTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({ payee: PAYEE, kind: "mortgage", can_tag: true }) }));
  untagTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({ payee: PAYEE, kind: null, can_tag: true }) }));
  vi.mocked(useTagLoanPayeeMutation).mockReturnValue([
    tagTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useTagLoanPayeeMutation>);
  vi.mocked(useUntagLoanPayeeMutation).mockReturnValue([
    untagTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useUntagLoanPayeeMutation>);
  loaded({});
});

describe("TransactionLoanPayeeSection", () => {
  it("tags the payee as a mortgage and offers an Undo", async () => {
    render(<TransactionLoanPayeeSection transaction={txn()} />);
    expect(screen.getByText(L.help(PAYEE))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: L.tagMortgage }));
    await waitFor(() => expect(tagTrigger).toHaveBeenCalledWith({ transactionId: "txn-1", kind: "mortgage" }));
    expect(showSuccess).toHaveBeenCalledWith(L.taggedToast(PAYEE), expect.objectContaining({ label: "Undo" }));
  });

  it("tags a transfer's payee as a loan", async () => {
    render(<TransactionLoanPayeeSection transaction={txn("transfer")} />);
    fireEvent.click(screen.getByRole("button", { name: L.tagLoan }));
    await waitFor(() => expect(tagTrigger).toHaveBeenCalledWith({ transactionId: "txn-1", kind: "loan" }));
  });

  it("says what a tagged payee counts as and takes it back", async () => {
    loaded({ kind: "mortgage" });
    render(<TransactionLoanPayeeSection transaction={txn()} />);
    expect(screen.getByText(L.tagged(PAYEE, "mortgage"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: L.untag }));
    await waitFor(() => expect(untagTrigger).toHaveBeenCalledWith("txn-1"));
    expect(showSuccess).toHaveBeenCalledWith(L.untaggedToast(PAYEE));
  });

  it("says so when saving fails", async () => {
    tagTrigger.mockReturnValue({ unwrap: () => Promise.reject(new Error("boom")) });
    render(<TransactionLoanPayeeSection transaction={txn()} />);
    fireEvent.click(screen.getByRole("button", { name: L.tagMortgage }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(L.tagFailed));
  });

  it("shows a skeleton while it checks", () => {
    loaded({}, { isLoading: true });
    render(<TransactionLoanPayeeSection transaction={txn()} />);
    expect(screen.getByTestId("loan-payee-skeleton")).toBeInTheDocument();
  });

  it("says so when it can't check", () => {
    vi.mocked(useGetLoanPayeeQuery).mockReturnValue({
      data: undefined, isLoading: false, isError: true,
    } as unknown as ReturnType<typeof useGetLoanPayeeQuery>);
    render(<TransactionLoanPayeeSection transaction={txn()} />);
    expect(screen.getByText(L.loadFailed)).toBeInTheDocument();
  });

  it.each([
    ["money in", txn("income")],
    ["a duplicate", txn("expense", "duplicate")],
    ["a personal transfer", txn("expense", "personal_transfer")],
  ])("isn't offered for %s", (_name, transaction) => {
    render(<TransactionLoanPayeeSection transaction={transaction} />);
    expect(screen.queryByRole("button", { name: L.tagMortgage })).not.toBeInTheDocument();
    expect(useGetLoanPayeeQuery).toHaveBeenLastCalledWith("txn-1", { skip: true });
  });

  it("isn't offered without write access or a named payee", () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    const { unmount } = render(<TransactionLoanPayeeSection transaction={txn()} />);
    expect(screen.queryByRole("button", { name: L.tagMortgage })).not.toBeInTheDocument();
    unmount();

    vi.mocked(useCanWrite).mockReturnValue(true);
    loaded({ can_tag: false });
    render(<TransactionLoanPayeeSection transaction={txn()} />);
    expect(screen.queryByRole("button", { name: L.tagMortgage })).not.toBeInTheDocument();
  });
});
