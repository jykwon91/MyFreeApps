/**
 * The mortgage dialogs run the same checks the phone does before anything is
 * sent. Without them the server's 422 came back as one generic failure toast
 * and the person could not tell which figure to change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddMortgageDialog from "@/app/features/mortgages/AddMortgageDialog";
import EditMortgageDialog from "@/app/features/mortgages/EditMortgageDialog";
import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";

const createUnwrap = vi.fn(() => Promise.resolve({}));
const mockCreate = vi.fn(() => ({ unwrap: createUnwrap }));
const updateUnwrap = vi.fn(() => Promise.resolve({}));
const mockUpdate = vi.fn(() => ({ unwrap: updateUnwrap }));

vi.mock("@mybookkeeper/api-client/store/mortgagesApi", () => ({
  useCreateMortgageMutation: vi.fn(() => [mockCreate, { isLoading: false }]),
  useUpdateMortgageMutation: vi.fn(() => [mockUpdate, { isLoading: false }]),
  useDeleteMortgageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/app/features/mortgages/MortgageDocumentReader", () => ({ default: () => null }));

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [{ id: "property-1", name: "6734 Peerless" }] })),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const MORTGAGE: Mortgage = {
  id: "mtg-a",
  user_id: "user-1",
  organization_id: "org-1",
  property_id: "property-1",
  property_name: "6734 Peerless",
  source_document_id: null,
  lender: "TDECU",
  account_number: null,
  current_balance_cents: 33613735,
  statement_date: "2026-08-01",
  original_principal_cents: null,
  interest_rate: "7.125",
  rate_type: "fixed",
  fixed_until: null,
  maturity_date: null,
  term_months: null,
  monthly_principal_cents: null,
  monthly_interest_cents: null,
  monthly_escrow_cents: null,
  notes: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

describe("EditMortgageDialog — checks before saving", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says what is wrong with an out-of-range rate and sends nothing", async () => {
    const user = userEvent.setup();
    render(<EditMortgageDialog mortgage={MORTGAGE} onClose={vi.fn()} />);
    expect(screen.queryByTestId("mortgage-interestRate-problem")).not.toBeInTheDocument();

    await user.clear(screen.getByTestId("mortgage-interest-rate-input"));
    await user.type(screen.getByTestId("mortgage-interest-rate-input"), "30");
    await user.click(screen.getByTestId("mortgage-update-button"));

    expect(screen.getByTestId("mortgage-interestRate-problem")).toHaveTextContent("above 0 and below 25");
    expect(screen.getByTestId("mortgage-interest-rate-input")).toHaveAttribute("aria-invalid", "true");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("asks for the statement date when a balance has none", async () => {
    const user = userEvent.setup();
    render(<EditMortgageDialog mortgage={MORTGAGE} onClose={vi.fn()} />);

    await user.clear(screen.getByTestId("mortgage-statement-date-input"));
    await user.click(screen.getByTestId("mortgage-update-button"));

    expect(screen.getByTestId("mortgage-statementDate-problem")).toHaveTextContent("statement date");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("asks for the balance when a date has none", async () => {
    const user = userEvent.setup();
    render(<EditMortgageDialog mortgage={MORTGAGE} onClose={vi.fn()} />);

    await user.clear(screen.getByTestId("mortgage-balance-input"));
    await user.click(screen.getByTestId("mortgage-update-button"));

    expect(screen.getByTestId("mortgage-balanceDollars-problem")).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("saves once the problem is fixed", async () => {
    const user = userEvent.setup();
    render(<EditMortgageDialog mortgage={MORTGAGE} onClose={vi.fn()} />);

    await user.clear(screen.getByTestId("mortgage-interest-rate-input"));
    await user.type(screen.getByTestId("mortgage-interest-rate-input"), "30");
    await user.click(screen.getByTestId("mortgage-update-button"));
    await user.clear(screen.getByTestId("mortgage-interest-rate-input"));
    await user.type(screen.getByTestId("mortgage-interest-rate-input"), "6.5");
    await user.click(screen.getByTestId("mortgage-update-button"));

    expect(screen.queryByTestId("mortgage-interestRate-problem")).not.toBeInTheDocument();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("AddMortgageDialog — checks before saving", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the missing rate type next to the field instead of a toast", async () => {
    const user = userEvent.setup();
    render(<AddMortgageDialog onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("mortgage-property-select"), "property-1");
    await user.click(screen.getByTestId("mortgage-save-button"));

    expect(screen.getByTestId("mortgage-rateType-problem")).toHaveTextContent("fixed or adjustable");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("blocks a balance without a date and names the field", async () => {
    const user = userEvent.setup();
    render(<AddMortgageDialog onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("mortgage-property-select"), "property-1");
    await user.selectOptions(screen.getByTestId("mortgage-rate-type-select"), "fixed");
    await user.type(screen.getByTestId("mortgage-balance-input"), "1000");
    await user.click(screen.getByTestId("mortgage-save-button"));

    expect(screen.getByTestId("mortgage-statementDate-problem")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the loan when the form is clean", async () => {
    const user = userEvent.setup();
    render(<AddMortgageDialog onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("mortgage-property-select"), "property-1");
    await user.selectOptions(screen.getByTestId("mortgage-rate-type-select"), "fixed");
    await user.type(screen.getByTestId("mortgage-interest-rate-input"), "7.125");
    await user.click(screen.getByTestId("mortgage-save-button"));

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
