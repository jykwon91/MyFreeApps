import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import FinancialAccountsBody, { type FinancialAccountsBodyProps } from "@/app/features/financial-accounts/FinancialAccountsBody";
import type { FinancialAccountListResponse } from "@mybookkeeper/api-client/types/financial-account/financial-account-list-response";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import { aFinancialAccount } from "@/test/financial-account-fixture";

const CHECKING = aFinancialAccount();
const CARD = aFinancialAccount({ id: "acct-2", name: "Sapphire", account_type: "credit_card", mask: "1234", current_balance_cents: 50000 });
const OLD = aFinancialAccount({ id: "acct-3", name: "Old Savings", account_type: "savings", mask: null, closed_on: "2026-01-31" });

const LOADED: FinancialAccountListResponse = {
  items: [CHECKING, CARD, OLD],
  totals: [{ currency: "USD", assets_cents: 250000, liabilities_cents: 50000, net_cents: 200000 }],
};

function renderBody(overrides: Partial<FinancialAccountsBodyProps> = {}) {
  const handlers = { onRetry: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn(), onUpdateBalance: vi.fn() };
  // Each row links to its transactions, so it renders inside a router.
  render(
    <MemoryRouter>
      <FinancialAccountsBody data={LOADED} isLoading={false} isError={false} isRetrying={false} {...handlers} {...overrides} />
    </MemoryRouter>,
  );
  return handlers;
}

afterEach(cleanup);

describe("FinancialAccountsBody", () => {
  it("shows the skeleton while the accounts load", () => {
    renderBody({ data: undefined, isLoading: true });
    expect(screen.getByTestId("financial-accounts-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("financial-accounts-totals")).not.toBeInTheDocument();
  });

  it("says the accounts couldn't load and retries on request", async () => {
    const { onRetry } = renderBody({ data: undefined, isError: true });
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("invites the first account when there are none", async () => {
    const { onAdd } = renderBody({ data: { items: [], totals: [] } });
    await userEvent.click(screen.getByRole("button", { name: MSG.emptyListAction }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("groups what you have, what you owe and closed accounts, with the totals on top", () => {
    renderBody();
    expect(within(screen.getByTestId("financial-accounts-assets")).getByText("Chase Checking ··4821")).toBeInTheDocument();
    expect(within(screen.getByTestId("financial-accounts-liabilities")).getByText("Sapphire ··1234")).toBeInTheDocument();
    expect(within(screen.getByTestId("financial-accounts-closed")).getByText("Old Savings")).toBeInTheDocument();
    expect(screen.getByTestId("financial-accounts-total-assets")).toHaveTextContent("$2,500.00");
    expect(screen.getByTestId("financial-accounts-total-liabilities")).toHaveTextContent("$500.00");
    expect(screen.getByTestId("financial-accounts-total-net")).toHaveTextContent("$2,000.00");
  });

  it("links each account to its transactions", () => {
    renderBody();
    const row = screen.getByTestId(`financial-account-row-${CARD.id}`);
    expect(within(row).getByRole("link", { name: MSG.viewTransactions })).toHaveAttribute("href", `/transactions?account=${CARD.id}`);
  });

  it("hands the row's account to the edit and update-balance actions", async () => {
    const { onEdit, onUpdateBalance } = renderBody();
    const row = screen.getByTestId(`financial-account-row-${CARD.id}`);
    await userEvent.click(within(row).getByTestId("financial-account-edit"));
    await userEvent.click(within(row).getByTestId("financial-account-update-balance"));
    expect(onEdit).toHaveBeenCalledWith(CARD);
    expect(onUpdateBalance).toHaveBeenCalledWith(CARD);
  });

  it("asks for a balance when no account has one yet", () => {
    renderBody({ data: { items: [aFinancialAccount({ current_balance_cents: null, balance_as_of: null })], totals: [] } });
    expect(screen.getByTestId("financial-accounts-no-totals")).toHaveTextContent(MSG.noTotalsYet);
  });
});
