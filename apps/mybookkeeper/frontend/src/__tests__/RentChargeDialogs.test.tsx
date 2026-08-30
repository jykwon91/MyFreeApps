import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import RentChargeDialog from "@/app/features/rent/RentChargeDialog";
import RentWaiveDialog from "@/app/features/rent/RentWaiveDialog";
import type { RentCharge } from "@/shared/types/rent/rent-charge";

const mockCreateCharge = vi.fn();
const mockWaive = vi.fn();

vi.mock("@/shared/store/rentLedgerApi", () => ({
  useCreateRentChargeMutation: () => [mockCreateCharge, { isLoading: false }],
  useWaiveRentChargeMutation: () => [mockWaive, { isLoading: false }],
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { showError, showSuccess } from "@/shared/lib/toast-store";

const CHARGE: RentCharge = {
  id: "chg-1",
  schedule_id: "sch-1",
  charge_type: "rent",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  due_date: "2026-08-01",
  amount: "1500.00",
  full_amount: null,
  description: null,
  waived_at: null,
  waived_reason: null,
  allocated: "0.00",
  remaining: "1500.00",
  status: "open",
  applications: [],
};

describe("RentChargeDialog", () => {
  beforeEach(() => {
    mockCreateCharge.mockReset();
    vi.mocked(showSuccess).mockReset();
    vi.mocked(showError).mockReset();
  });

  function renderDialog(onClose = vi.fn()) {
    render(
      <Provider store={store}>
        <RentChargeDialog applicantId="app-1" onClose={onClose} />
      </Provider>,
    );
    return onClose;
  }

  it("adds a one-off charge with amount, due date and kind", async () => {
    mockCreateCharge.mockReturnValueOnce({
      unwrap: () => Promise.resolve({ id: "chg-2" }),
    });
    const onClose = renderDialog();

    fireEvent.change(screen.getByTestId("rent-charge-amount"), {
      target: { value: "75.00" },
    });
    fireEvent.change(screen.getByTestId("rent-charge-due"), {
      target: { value: "2026-08-06" },
    });
    fireEvent.change(screen.getByTestId("rent-charge-description"), {
      target: { value: "August electricity share" },
    });
    fireEvent.click(screen.getByTestId("rent-charge-save-button"));

    await waitFor(() => {
      expect(mockCreateCharge).toHaveBeenCalledWith({
        applicant_id: "app-1",
        amount: "75.00",
        due_date: "2026-08-06",
        charge_type: "late_fee",
        description: "August electricity share",
      });
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not offer 'rent' as a manual kind, since the schedule generates it", () => {
    renderDialog();
    const options = Array.from(
      screen.getByTestId("rent-charge-type").querySelectorAll("option"),
    ).map((option) => option.textContent);
    expect(options).not.toContain("Rent");
    expect(options).toContain("Late fee");
  });

  it("blocks submission until amount and due date are set", () => {
    renderDialog();
    expect(screen.getByTestId("rent-charge-save-button")).toBeDisabled();
    fireEvent.change(screen.getByTestId("rent-charge-amount"), {
      target: { value: "75.00" },
    });
    fireEvent.change(screen.getByTestId("rent-charge-due"), {
      target: { value: "2026-08-06" },
    });
    expect(screen.getByTestId("rent-charge-save-button")).toBeEnabled();
  });

  it("holds sub-cent amounts at the input, so the ledger never rounds silently", () => {
    renderDialog();
    // ``Numeric(12, 2)`` would quietly round 75.555 to 75.56. The step keeps
    // the browser from submitting it at all, and the backend rejects it as a
    // 422 if anything else tries.
    expect(screen.getByTestId("rent-charge-amount")).toHaveAttribute(
      "step",
      "0.01",
    );
  });

  it("surfaces a server rejection rather than closing silently", async () => {
    mockCreateCharge.mockReturnValueOnce({
      unwrap: () => Promise.reject({ data: { detail: "Tenant not found" } }),
    });
    const onClose = renderDialog();

    fireEvent.change(screen.getByTestId("rent-charge-amount"), {
      target: { value: "75.00" },
    });
    fireEvent.change(screen.getByTestId("rent-charge-due"), {
      target: { value: "2026-08-06" },
    });
    fireEvent.click(screen.getByTestId("rent-charge-save-button"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Tenant not found");
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("RentWaiveDialog", () => {
  beforeEach(() => {
    mockWaive.mockReset();
    vi.mocked(showSuccess).mockReset();
    vi.mocked(showError).mockReset();
  });

  function renderDialog(onClose = vi.fn()) {
    render(
      <Provider store={store}>
        <RentWaiveDialog charge={CHARGE} applicantId="app-1" onClose={onClose} />
      </Provider>,
    );
    return onClose;
  }

  it("names the charge it is about to waive", () => {
    renderDialog();
    expect(screen.getByTestId("rent-waive-dialog")).toHaveTextContent("$1,500.00");
    expect(screen.getByTestId("rent-waive-dialog")).toHaveTextContent(
      "Aug 1 – Aug 31",
    );
  });

  it("requires a reason before waiving", () => {
    renderDialog();
    expect(screen.getByTestId("rent-waive-save-button")).toBeDisabled();
    fireEvent.change(screen.getByTestId("rent-waive-reason"), {
      target: { value: "   " },
    });
    expect(screen.getByTestId("rent-waive-save-button")).toBeDisabled();
  });

  it("waives with the trimmed reason", async () => {
    mockWaive.mockReturnValueOnce({ unwrap: () => Promise.resolve(undefined) });
    const onClose = renderDialog();

    fireEvent.change(screen.getByTestId("rent-waive-reason"), {
      target: { value: "  Room was being repainted.  " },
    });
    fireEvent.click(screen.getByTestId("rent-waive-save-button"));

    await waitFor(() => {
      expect(mockWaive).toHaveBeenCalledWith({
        chargeId: "chg-1",
        applicantId: "app-1",
        reason: "Room was being repainted.",
      });
    });
    expect(showSuccess).toHaveBeenCalledWith("Charge waived.");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
