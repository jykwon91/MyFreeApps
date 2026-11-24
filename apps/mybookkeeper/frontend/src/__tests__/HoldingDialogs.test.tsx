import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import AddHoldingDialog from "@/app/features/holdings/AddHoldingDialog";
import EditHoldingDialog from "@/app/features/holdings/EditHoldingDialog";
import RemoveHoldingDialog from "@/app/features/holdings/RemoveHoldingDialog";
import { HOLDING_PROBLEM_MESSAGES as PROBLEM, HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

const createHolding = vi.fn();
const updateHolding = vi.fn();
const deleteHolding = vi.fn();
vi.mock("@mybookkeeper/api-client/store/holdingsApi", () => ({
  useCreateHoldingMutation: () => [createHolding, { isLoading: false }],
  useUpdateHoldingMutation: () => [updateHolding, { isLoading: false }],
  useDeleteHoldingMutation: () => [deleteHolding, { isLoading: false }],
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const ACCOUNT: FinancialAccount = {
  id: "a1", organization_id: "o", user_id: "u", name: "Brokerage", institution_name: null,
  account_type: "brokerage", classification: "asset", mask: null, currency: "USD",
  current_balance_cents: null, balance_as_of: null, closed_on: null, mortgage_id: null,
  default_transaction_scope: "personal", plaid_item_id: null, created_at: "", updated_at: "",
};

const HOLDING: Holding = {
  id: "h1", financial_account_id: "a1", account_name: "Brokerage", is_manual: true, security_id: "s1",
  ticker_symbol: "VTI", name: "Vanguard", security_type: "etf", quantity: "10.5000000000",
  price: "250.00000000", price_as_of: "2026-11-24", is_price_stale: false, value_cents: 262_500,
  cost_basis_cents: null, gain_loss_cents: null, gain_loss_percent: null, currency: "USD",
};

function resolves(mock: ReturnType<typeof vi.fn>, value: unknown = {}) {
  mock.mockReturnValue({ unwrap: () => Promise.resolve(value) });
}

beforeEach(() => {
  createHolding.mockReset();
  updateHolding.mockReset();
  deleteHolding.mockReset();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

describe("AddHoldingDialog", () => {
  it("shows what's missing on save and sends nothing", async () => {
    render(<AddHoldingDialog accounts={[ACCOUNT]} defaultAccountId="a1" onClose={vi.fn()} />);
    await userEvent.click(screen.getByTestId("holding-save-button"));
    const dialog = within(screen.getByTestId("add-holding-dialog"));
    expect(dialog.getByText(PROBLEM.ticker_or_name)).toBeInTheDocument();
    expect(dialog.getAllByText(PROBLEM.required)).toHaveLength(2);
    expect(createHolding).not.toHaveBeenCalled();
  });

  it("adds a holding with decimals as typed and confirms", async () => {
    resolves(createHolding);
    const onClose = vi.fn();
    render(<AddHoldingDialog accounts={[ACCOUNT]} defaultAccountId="a1" onClose={onClose} />);
    await userEvent.type(screen.getByTestId("holding-ticker-input"), "vti");
    await userEvent.selectOptions(screen.getByTestId("holding-type-select"), "etf");
    await userEvent.type(screen.getByTestId("holding-quantity-input"), "0.123456");
    await userEvent.type(screen.getByTestId("holding-price-input"), "250.1234");
    await userEvent.type(screen.getByTestId("holding-cost-basis-input"), "25.00");
    await userEvent.click(screen.getByTestId("holding-save-button"));

    expect(createHolding).toHaveBeenCalledWith({
      financial_account_id: "a1", ticker_symbol: "VTI", name: null, security_type: "etf",
      quantity: "0.123456", price: "250.1234", cost_basis_cents: 2500,
    });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MSG.added));
    expect(onClose).toHaveBeenCalled();
  });

  it("says plainly when the account already holds it", async () => {
    createHolding.mockReturnValue({ unwrap: () => Promise.reject({ status: 409, data: { detail: "dup" } }) });
    render(<AddHoldingDialog accounts={[ACCOUNT]} defaultAccountId="a1" onClose={vi.fn()} />);
    await userEvent.type(screen.getByTestId("holding-ticker-input"), "VTI");
    await userEvent.type(screen.getByTestId("holding-quantity-input"), "1");
    await userEvent.type(screen.getByTestId("holding-price-input"), "1");
    await userEvent.click(screen.getByTestId("holding-save-button"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MSG.duplicate));
  });
});

describe("EditHoldingDialog", () => {
  it("opens with the holding's values and sends only what changed", async () => {
    resolves(updateHolding);
    render(<EditHoldingDialog holding={HOLDING} onClose={vi.fn()} />);
    const price = screen.getByTestId("holding-price-input");
    expect(screen.getByTestId("holding-quantity-input")).toHaveValue("10.5");
    expect(price).toHaveValue("250");
    await userEvent.clear(price);
    await userEvent.type(price, "260");
    await userEvent.click(screen.getByTestId("holding-save-button"));
    expect(updateHolding).toHaveBeenCalledWith({ holdingId: "h1", data: { price: "260" } });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MSG.saved));
  });

  it("closes without a request when nothing changed", async () => {
    const onClose = vi.fn();
    render(<EditHoldingDialog holding={HOLDING} onClose={onClose} />);
    await userEvent.click(screen.getByTestId("holding-save-button"));
    expect(updateHolding).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("RemoveHoldingDialog", () => {
  it("removes after confirming", async () => {
    resolves(deleteHolding, undefined);
    const onClose = vi.fn();
    render(<RemoveHoldingDialog holding={HOLDING} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(MSG.removeDescription)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: MSG.remove }));
    expect(deleteHolding).toHaveBeenCalledWith("h1");
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MSG.removed));
    expect(onClose).toHaveBeenCalled();
  });
});
