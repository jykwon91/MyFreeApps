/** Opening a property's break-even shows every line that adds up to it. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RentalRoi from "@/app/features/analytics/RentalRoi";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import type { RentalRoiResponse } from "@mybookkeeper/api-client/types/analytics/rental-roi-response";

vi.mock("@mybookkeeper/api-client/store/analyticsApi", () => ({
  useGetRentalRoiQuery: vi.fn(),
}));

import { useGetRentalRoiQuery } from "@mybookkeeper/api-client/store/analyticsApi";

const PEERLESS: RentalRoiProperty = {
  property_id: "prop-a",
  property_name: "6732 Peerless",
  is_personal_home: false,
  months_averaged: 12,
  has_purchase_price: false,
  mortgage_source: "records",
  break_even_monthly_cents: 280000,
  target_monthly_cents: null,
  actual_revenue_monthly_cents: 300000,
  gap_monthly_cents: 20000,
  gap_basis: "break_even",
  cash_invested_cents: null,
  noi_annual_cents: 0,
  cap_rate_pct: null,
  cash_on_cash_pct: null,
  cost_breakdown: {
    debt_service_monthly_cents: 200000,
    operating_monthly_cents: 80000,
    mortgage_lines: [
      { category: "mortgage_principal", monthly_cents: 70000, window_total_cents: null },
      { category: "mortgage_interest", monthly_cents: 100000, window_total_cents: null },
      { category: "mortgage_escrow", monthly_cents: 30000, window_total_cents: null },
    ],
    operating_lines: [
      { category: "contract_work", monthly_cents: 60000, window_total_cents: 720000 },
      { category: "utilities", monthly_cents: 20000, window_total_cents: 240000 },
    ],
    escrow_covered_lines: [{ category: "taxes", monthly_cents: 25000, window_total_cents: 300000 }],
  },
};

function respondWith(property: RentalRoiProperty) {
  const data: RentalRoiResponse = {
    window_start: "2025-11-01",
    window_end: "2026-10-31",
    target_return_pct: "8",
    has_transactions: true,
    unassigned_revenue_monthly_cents: 0,
    summary: {
      property_count: 1,
      properties_with_target: 0,
      total_break_even_monthly_cents: property.break_even_monthly_cents,
      total_target_monthly_cents: 0,
      total_actual_revenue_monthly_cents: property.actual_revenue_monthly_cents,
      total_gap_monthly_cents: property.gap_monthly_cents,
      gap_basis: "break_even",
    },
    properties: [property],
  };
  vi.mocked(useGetRentalRoiQuery).mockReturnValue({
    data,
    error: undefined,
    isFetching: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGetRentalRoiQuery>);
}

async function openPanel() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <RentalRoi />
    </MemoryRouter>,
  );
  const [trigger] = screen.getAllByRole("button", { name: /See how the 6732 Peerless break-even/, hidden: true });
  await user.click(trigger);
  return { user, panel: await screen.findByRole("dialog") };
}

beforeEach(() => {
  respondWith(PEERLESS);
});

describe("Break-even breakdown", () => {
  it("is closed until a break-even is clicked", () => {
    render(
      <MemoryRouter>
        <RentalRoi />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the property, the amount and the period", async () => {
    const { panel } = await openPanel();
    expect(within(panel).getByRole("heading", { name: "Break-even: 6732 Peerless" })).toBeInTheDocument();
    expect(within(panel).getByText("$2,800/mo")).toBeInTheDocument();
    expect(within(panel).getByText("Average of Nov 2025 – Oct 2026 (12 months)")).toBeInTheDocument();
  });

  it("shows each cost, how it was averaged, and the total", async () => {
    const { panel } = await openPanel();
    const operating = within(within(panel).getByRole("region", { name: "Operating costs" }));
    expect(operating.getByText("Contract Work")).toBeInTheDocument();
    expect(operating.getByText("$7,200.00 ÷ 12 months")).toBeInTheDocument();
    expect(operating.getByText("$600.00/mo")).toBeInTheDocument();
    expect(operating.getByText("$800.00/mo")).toBeInTheDocument();
    expect(within(panel).getByTestId("rental-roi-break-even-total")).toHaveTextContent("$2,800.00/mo");
  });

  it("lists the parts of a loan payment under Mortgage", async () => {
    const { panel } = await openPanel();
    const mortgage = within(within(panel).getByRole("region", { name: "Mortgage" }));
    expect(mortgage.getByText("Principal")).toBeInTheDocument();
    expect(mortgage.getByText("Interest")).toBeInTheDocument();
    expect(mortgage.getByText("Escrow")).toBeInTheDocument();
    expect(mortgage.getByText("From your loan record.")).toBeInTheDocument();
  });

  it("shows bills escrow pays as not counted, with no subtotal", async () => {
    const { panel } = await openPanel();
    const left = within(within(panel).getByRole("region", { name: "Not counted: already paid by escrow" }));
    expect(left.getByText("Taxes")).toBeInTheDocument();
    expect(left.getAllByText(/\/mo$/)).toHaveLength(1);
  });

  it("offers to add a loan when there is no mortgage", async () => {
    respondWith({
      ...PEERLESS,
      mortgage_source: "none",
      cost_breakdown: { ...PEERLESS.cost_breakdown, debt_service_monthly_cents: 0, mortgage_lines: [], escrow_covered_lines: [] },
    });
    const { panel } = await openPanel();
    expect(within(panel).getByRole("link", { name: "Add a loan" })).toHaveAttribute("href", "/mortgages");
  });

  it("says so when there are no operating costs", async () => {
    respondWith({
      ...PEERLESS,
      cost_breakdown: { ...PEERLESS.cost_breakdown, operating_monthly_cents: 0, operating_lines: [] },
    });
    const { panel } = await openPanel();
    expect(within(panel).getByText("No operating expenses recorded in this period.")).toBeInTheDocument();
  });

  it("says when a property is also the owner's home", async () => {
    respondWith({ ...PEERLESS, is_personal_home: true });
    render(
      <MemoryRouter>
        <RentalRoi />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/Your home: counts all of its costs/).length).toBeGreaterThan(0);
  });

  it("closes from its close button", async () => {
    const { user, panel } = await openPanel();
    await user.click(within(panel).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
