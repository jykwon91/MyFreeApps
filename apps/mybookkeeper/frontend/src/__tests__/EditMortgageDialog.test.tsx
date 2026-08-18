/**
 * Unit tests for editing a recorded loan.
 *
 * Two behaviours are load-bearing. The form opens prefilled from the stored
 * row, because an edit dialog that starts blank turns "correct the balance"
 * into "retype the loan". And removal is confirmed before it happens — the row
 * was typed in by hand off a paper statement, so it costs far more to restore
 * than to destroy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditMortgageDialog from "@/app/features/mortgages/EditMortgageDialog";
import type { Mortgage } from "@/shared/types/mortgage/mortgage";

const updateUnwrap = vi.fn(() => Promise.resolve({}));
const deleteUnwrap = vi.fn(() => Promise.resolve({}));
const mockUpdate = vi.fn(() => ({ unwrap: updateUnwrap }));
const mockDelete = vi.fn(() => ({ unwrap: deleteUnwrap }));

vi.mock("@/shared/store/mortgagesApi", () => ({
  useUpdateMortgageMutation: vi.fn(() => [mockUpdate, { isLoading: false }]),
  useDeleteMortgageMutation: vi.fn(() => [mockDelete, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
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
  account_number: "240224944",
  current_balance_cents: 33613735,
  statement_date: "2026-08-01",
  original_principal_cents: null,
  interest_rate: "7.125",
  rate_type: "fixed",
  fixed_until: null,
  maturity_date: null,
  term_months: null,
  monthly_principal_cents: 30156,
  monthly_interest_cents: 199582,
  monthly_escrow_cents: 87081,
  notes: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const onClose = vi.fn();

function renderDialog(mortgage: Mortgage = MORTGAGE) {
  return render(<EditMortgageDialog mortgage={mortgage} onClose={onClose} />);
}

describe("EditMortgageDialog — prefill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens with the stored loan in the fields", () => {
    renderDialog();
    expect(screen.getByTestId("mortgage-lender-input")).toHaveValue("TDECU");
    expect(screen.getByTestId("mortgage-interest-rate-input")).toHaveValue(7.125);
    expect(screen.getByTestId("mortgage-rate-type-select")).toHaveValue("fixed");
    expect(screen.getByTestId("mortgage-balance-input")).toHaveValue(336137.35);
    expect(screen.getByTestId("mortgage-statement-date-input")).toHaveValue(
      "2026-08-01",
    );
  });

  it("shows the reset date only on an adjustable loan", () => {
    renderDialog();
    expect(screen.queryByTestId("mortgage-fixed-until-input")).not.toBeInTheDocument();

    renderDialog({ ...MORTGAGE, rate_type: "arm", fixed_until: "2035-02-01" });
    expect(screen.getByTestId("mortgage-fixed-until-input")).toHaveValue(
      "2035-02-01",
    );
  });

  it("saves the whole loan, not only the field that changed", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.clear(screen.getByTestId("mortgage-balance-input"));
    await user.type(screen.getByTestId("mortgage-balance-input"), "335835.79");
    await user.click(screen.getByTestId("mortgage-update-button"));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        mortgageId: "mtg-a",
        data: expect.objectContaining({
          current_balance_cents: 33583579,
          lender: "TDECU",
          interest_rate: "7.125",
          rate_type: "fixed",
          monthly_escrow_cents: 87081,
        }),
      }),
    );
  });
});

describe("EditMortgageDialog — removal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks before removing anything", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("mortgage-delete-button"));

    expect(screen.getByText("Remove this mortgage?")).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("names the property in the confirmation", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("mortgage-delete-button"));
    expect(screen.getByText("6734 Peerless")).toBeInTheDocument();
  });

  it("removes the loan once confirmed", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("mortgage-delete-button"));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(mockDelete).toHaveBeenCalledWith("mtg-a");
  });

  it("keeps the loan when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("mortgage-delete-button"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Remove this mortgage?")).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
