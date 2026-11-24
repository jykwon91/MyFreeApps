import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import AddFinancialAccountDialog from "@/app/features/financial-accounts/AddFinancialAccountDialog";
import { FINANCIAL_ACCOUNT_PROBLEM_MESSAGES } from "@/shared/lib/financial-account-messages";

const createAccount = vi.fn();
vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", () => ({
  useCreateFinancialAccountMutation: () => [createAccount, { isLoading: false }],
}));
vi.mock("@mybookkeeper/api-client/hooks/useMortgagesPages", () => ({
  useMortgagesPages: () => ({ items: [], isLoading: false, isError: false }),
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

beforeEach(() => {
  createAccount.mockReset();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

describe("AddFinancialAccountDialog", () => {
  it("names what's missing and sends nothing", async () => {
    render(<AddFinancialAccountDialog onClose={vi.fn()} />);
    await userEvent.click(screen.getByTestId("financial-account-save-button"));
    expect(await screen.findByText(FINANCIAL_ACCOUNT_PROBLEM_MESSAGES.name_required)).toBeInTheDocument();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("refuses punctuation in the last-4 field", async () => {
    render(<AddFinancialAccountDialog onClose={vi.fn()} />);
    await userEvent.type(screen.getByTestId("financial-account-name-input"), "Checking");
    await userEvent.type(screen.getByTestId("financial-account-mask-input"), "12-4");
    await userEvent.click(screen.getByTestId("financial-account-save-button"));
    expect(await screen.findByText(FINANCIAL_ACCOUNT_PROBLEM_MESSAGES.mask_format)).toBeInTheDocument();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("saves the account with its balance in cents and closes", async () => {
    createAccount.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const onClose = vi.fn();
    render(<AddFinancialAccountDialog onClose={onClose} />);

    await userEvent.type(screen.getByTestId("financial-account-name-input"), "Sapphire");
    await userEvent.selectOptions(screen.getByTestId("financial-account-type-select"), "credit_card");
    await userEvent.type(screen.getByTestId("financial-account-mask-input"), "1234");
    await userEvent.type(screen.getByTestId("financial-account-balance-input"), "512.40");
    await userEvent.type(screen.getByTestId("financial-account-balance-date-input"), "2026-11-20");
    await userEvent.click(screen.getByTestId("financial-account-save-button"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createAccount).toHaveBeenCalledWith(expect.objectContaining({
      name: "Sapphire",
      account_type: "credit_card",
      mask: "1234",
      current_balance_cents: 51240,
      balance_as_of: "2026-11-20",
    }));
    expect(showSuccess).toHaveBeenCalled();
  });

  it("keeps the dialog open and says why when the save fails", async () => {
    createAccount.mockReturnValue({ unwrap: () => Promise.reject({ status: 500 }) });
    const onClose = vi.fn();
    render(<AddFinancialAccountDialog onClose={onClose} />);
    await userEvent.type(screen.getByTestId("financial-account-name-input"), "Checking");
    await userEvent.selectOptions(screen.getByTestId("financial-account-type-select"), "checking");
    await userEvent.click(screen.getByTestId("financial-account-save-button"));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
