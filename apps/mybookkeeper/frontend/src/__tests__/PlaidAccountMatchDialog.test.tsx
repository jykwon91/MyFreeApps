import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import type { PlaidPendingConnection } from "@mybookkeeper/api-client/types/plaid/plaid-pending-connection";
import PlaidAccountMatchDialog from "@/app/features/financial-accounts/plaid/PlaidAccountMatchDialog";
import { aFinancialAccount } from "@/test/financial-account-fixture";

const connect = vi.fn();
const accounts = [
  aFinancialAccount({ id: "acct-1", name: "My checking", mask: "4321" }),
  aFinancialAccount({ id: "acct-2", name: "Old savings", account_type: "savings", mask: "1111" }),
];
vi.mock("@mybookkeeper/api-client/store/plaidApi", () => ({
  useConnectPlaidItemMutation: () => [connect, { isLoading: false }],
}));
vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", () => ({
  useListFinancialAccountsQuery: () => ({ data: { items: accounts, totals: [] }, isLoading: false }),
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const connection: PlaidPendingConnection = {
  publicToken: "public-sandbox-1",
  institutionId: "ins_3",
  institutionName: "Chase",
  accounts: [
    { id: "p-checking", name: "Plaid Checking", mask: "4321", type: "depository", subtype: "checking" },
    { id: "p-card", name: "Plaid Card", mask: "9999", type: "credit", subtype: "credit card" },
  ],
};

beforeEach(() => {
  connect.mockReset();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

describe("PlaidAccountMatchDialog", () => {
  it("picks the existing account with the same last digits and adds the rest", () => {
    render(<PlaidAccountMatchDialog connection={connection} onClose={vi.fn()} />);
    const checking = screen.getByTestId("plaid-match-row-p-checking");
    const card = screen.getByTestId("plaid-match-row-p-card");
    expect(within(checking).getByTestId("plaid-match-account")).toHaveValue("acct-1");
    expect(within(card).getByTestId("plaid-match-account")).toHaveValue("");
  });

  it("never offers an account already chosen for another bank account", () => {
    render(<PlaidAccountMatchDialog connection={connection} onClose={vi.fn()} />);
    const card = screen.getByTestId("plaid-match-row-p-card");
    const options = within(within(card).getByTestId("plaid-match-account"))
      .getAllByRole("option")
      .map((option) => option.getAttribute("value"));
    expect(options).toEqual(["", "acct-2"]);
  });

  it("sends each choice with its filing scope and closes", async () => {
    connect.mockReturnValue({ unwrap: () => Promise.resolve({ institution_name: "Chase" }) });
    const onClose = vi.fn();
    render(<PlaidAccountMatchDialog connection={connection} onClose={onClose} />);

    const checking = screen.getByTestId("plaid-match-row-p-checking");
    await userEvent.selectOptions(within(checking).getByTestId("plaid-match-scope"), "rental");
    await userEvent.click(screen.getByTestId("plaid-match-save"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(connect).toHaveBeenCalledWith({
      public_token: "public-sandbox-1",
      institution_id: "ins_3",
      institution_name: "Chase",
      accounts: [
        { plaid_account_id: "p-checking", financial_account_id: "acct-1", default_transaction_scope: "rental" },
        { plaid_account_id: "p-card", financial_account_id: null, default_transaction_scope: "personal" },
      ],
    });
    expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining("Chase connected"));
  });

  it("shows the server's reason when it refuses the connection", async () => {
    connect.mockReturnValue({
      unwrap: () => Promise.reject({ status: 422, data: { detail: "This bank connection is already saved" } }),
    });
    const onClose = vi.fn();
    render(<PlaidAccountMatchDialog connection={connection} onClose={onClose} />);
    await userEvent.click(screen.getByTestId("plaid-match-save"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("This bank connection is already saved"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
