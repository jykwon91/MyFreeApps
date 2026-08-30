import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import RentLedgerPanel from "@/app/features/rent/RentLedgerPanel";
import type { RentLedgerResponse } from "@/shared/types/rent/rent-ledger-response";

const mockGetLedger = vi.fn();
const mockRefetch = vi.fn();

vi.mock("@/shared/store/rentLedgerApi", () => ({
  useGetRentLedgerQuery: (...args: unknown[]) => mockGetLedger(...args),
  useCreateRentScheduleMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateRentScheduleMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteRentScheduleMutation: () => [vi.fn(), { isLoading: false }],
  useCreateRentChargeMutation: () => [vi.fn(), { isLoading: false }],
  useWaiveRentChargeMutation: () => [vi.fn(), { isLoading: false }],
  useUnwaiveRentChargeMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteRentChargeMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => true,
}));

/**
 * Sonu's case, as the ledger returns it: $1,500 charged monthly, paid $375 a
 * week, three weeks into August.
 */
const SONU_LEDGER: RentLedgerResponse = {
  applicant_id: "app-1",
  as_of: "2026-08-20",
  schedules: [
    {
      id: "sch-1",
      applicant_id: "app-1",
      property_id: null,
      amount: "1500.00",
      cadence: "monthly",
      start_date: "2026-08-01",
      end_date: null,
      grace_days: null,
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    },
  ],
  charges: [
    {
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
      allocated: "1125.00",
      remaining: "375.00",
      status: "partial",
      applications: [
        {
          transaction_id: "txn-1",
          paid_on: "2026-08-03",
          amount: "375.00",
          payer_name: "Sonu",
          payment_total: "375.00",
        },
      ],
    },
  ],
  payments: [],
  current_period: {
    charge_id: "chg-1",
    label: "August 2026",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    amount: "1500.00",
    full_amount: null,
    allocated: "1125.00",
    remaining: "375.00",
    status: "partial",
  },
  total_charged: "1500.00",
  total_paid: "1125.00",
  balance: "375.00",
  unapplied_credit: "0.00",
};

function emptyLedger(): RentLedgerResponse {
  return {
    ...SONU_LEDGER,
    schedules: [],
    charges: [],
    current_period: null,
    total_charged: "0.00",
    total_paid: "0.00",
    balance: "0.00",
  };
}

function renderPanel() {
  return render(
    <Provider store={store}>
      <RentLedgerPanel applicantId="app-1" />
    </Provider>,
  );
}

describe("RentLedgerPanel", () => {
  beforeEach(() => {
    mockGetLedger.mockReset();
    mockRefetch.mockReset();
    mockGetLedger.mockReturnValue({
      data: SONU_LEDGER,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
  });

  it("shows the skeleton while loading, with the same sections as the loaded panel", () => {
    mockGetLedger.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    });
    renderPanel();
    expect(screen.getByTestId("rent-ledger-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("rent-ledger-body")).not.toBeInTheDocument();
  });

  it("answers 'how much has he paid this month' as a fraction, not a total", () => {
    renderPanel();
    expect(screen.getByTestId("rent-current-allocated")).toHaveTextContent(
      "$1,125.00",
    );
    expect(screen.getByTestId("rent-current-period")).toHaveTextContent(
      "of $1,500.00",
    );
    expect(screen.getByTestId("rent-current-remaining")).toHaveTextContent(
      "$375.00 still to come",
    );
  });

  it("explains a prorated first period instead of leaving it looking short", () => {
    // A mid-month move-in owes 17 of August's 31 days. Without the note,
    // $822.58 against a $1,500 schedule reads as a data error.
    mockGetLedger.mockReturnValue({
      data: {
        ...SONU_LEDGER,
        charges: [
          { ...SONU_LEDGER.charges[0], amount: "822.58", full_amount: "1500.00" },
        ],
        current_period: {
          ...SONU_LEDGER.current_period!,
          amount: "822.58",
          full_amount: "1500.00",
        },
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderPanel();
    expect(screen.getByTestId("rent-current-prorated")).toHaveTextContent(
      "Prorated from $1,500.00 for a partial month",
    );
  });

  it("states a part-month's dates once, not twice", () => {
    // The label for a part-month IS its date range, so appending the range
    // again would read "Aug 15 – Aug 31, 2026 · Aug 15 – Aug 31".
    mockGetLedger.mockReturnValue({
      data: {
        ...SONU_LEDGER,
        current_period: {
          ...SONU_LEDGER.current_period!,
          label: "Aug 15 – Aug 31, 2026",
          period_start: "2026-08-15",
        },
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderPanel();
    const card = screen.getByTestId("rent-current-period");
    expect(card).toHaveTextContent("Aug 15 – Aug 31, 2026");
    expect(card.textContent).not.toContain("2026 · Aug 15");
  });

  it("adds the explicit dates to a whole month, where they say something new", () => {
    renderPanel();
    expect(screen.getByTestId("rent-current-period")).toHaveTextContent(
      "August 2026 · Aug 1 – Aug 31",
    );
  });

  it("leaves a whole period unannotated, since it needs no explaining", () => {
    renderPanel();
    expect(screen.queryByTestId("rent-current-prorated")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rent-charge-prorated")).not.toBeInTheDocument();
  });

  it("reports a weekly payer mid-month as partly paid, not overdue", () => {
    renderPanel();
    expect(screen.getByTestId("rent-current-status")).toHaveTextContent(
      "Partly paid",
    );
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("exposes the progress as an accessible progressbar", () => {
    renderPanel();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "75");
  });

  it("shows the overall balance owed", () => {
    renderPanel();
    expect(screen.getByTestId("rent-balance-owed")).toHaveTextContent("$375.00");
  });

  it("shows a credit rather than a negative balance when the tenant is paid ahead", () => {
    mockGetLedger.mockReturnValue({
      data: { ...SONU_LEDGER, balance: "-375.00" },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderPanel();
    expect(screen.getByTestId("rent-balance-line")).toHaveTextContent(
      "Paid ahead by",
    );
    expect(screen.getByTestId("rent-balance-credit")).toHaveTextContent("$375.00");
  });

  it("summarises the schedule in terms of what is owed and how often", () => {
    renderPanel();
    expect(screen.getByTestId("rent-schedule-summary")).toHaveTextContent(
      "$1,500.00",
    );
    expect(screen.getByTestId("rent-schedule-summary")).toHaveTextContent(
      "monthly from August 1, 2026",
    );
  });

  it("reveals which payments settled a charge only when expanded", () => {
    renderPanel();
    expect(
      screen.queryByTestId("rent-charge-applications"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rent-charge-toggle"));
    expect(screen.getByTestId("rent-charge-applications")).toHaveTextContent(
      "$375.00",
    );
    expect(screen.getByTestId("rent-charge-applications")).toHaveTextContent(
      "Sonu",
    );
  });

  it("prompts to set up rent when no schedule exists", () => {
    mockGetLedger.mockReturnValue({
      data: emptyLedger(),
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderPanel();
    expect(screen.getByTestId("rent-ledger-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("rent-ledger-body")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rent-setup-button"));
    expect(screen.getByTestId("rent-schedule-dialog")).toBeInTheDocument();
  });

  it("says so plainly when no period is live rather than implying rent is accruing", () => {
    mockGetLedger.mockReturnValue({
      data: { ...SONU_LEDGER, current_period: null },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderPanel();
    expect(screen.getByTestId("rent-no-current-period")).toBeInTheDocument();
    expect(screen.queryByTestId("rent-current-period")).not.toBeInTheDocument();
  });

  it("offers a retry when the ledger fails to load", () => {
    mockGetLedger.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });
    renderPanel();
    fireEvent.click(screen.getByTestId("rent-ledger-retry"));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it("opens the waive dialog from a charge row", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("rent-waive-charge-button"));
    expect(screen.getByTestId("rent-waive-dialog")).toBeInTheDocument();
  });

  it("offers no delete on a schedule-generated charge, since it would regenerate", () => {
    renderPanel();
    expect(
      screen.queryByTestId("rent-delete-charge-button"),
    ).not.toBeInTheDocument();
  });

  it("offers delete on a one-off charge", () => {
    mockGetLedger.mockReturnValue({
      data: {
        ...SONU_LEDGER,
        charges: [{ ...SONU_LEDGER.charges[0], schedule_id: null }],
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderPanel();
    expect(screen.getByTestId("rent-delete-charge-button")).toBeInTheDocument();
  });
});
