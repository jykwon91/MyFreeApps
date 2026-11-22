import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../src/constants/rentalRoi";
import RentalRoiBreakEvenBreakdown from "../src/features/analytics/RentalRoiBreakEvenBreakdown";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path), navigate: jest.fn() } }));

function aProperty(mortgageSource: RentalRoiProperty["mortgage_source"]): RentalRoiProperty {
  return {
    property_id: "p1",
    property_name: "Elm St",
    months_averaged: 6,
    has_purchase_price: true,
    mortgage_source: mortgageSource,
    break_even_monthly_cents: 50000,
    target_monthly_cents: null,
    actual_revenue_monthly_cents: 180000,
    gap_monthly_cents: 0,
    gap_basis: "break_even",
    cash_invested_cents: null,
    noi_annual_cents: 0,
    cap_rate_pct: null,
    cash_on_cash_pct: null,
    is_personal_home: false,
    cost_breakdown: {
      debt_service_monthly_cents: 0,
      operating_monthly_cents: 50000,
      mortgage_lines: [],
      operating_lines: [],
      escrow_covered_lines: [],
    },
  } as RentalRoiProperty;
}

describe("RentalRoiBreakEvenBreakdown", () => {
  beforeEach(() => mockPush.mockClear());

  it("links 'Add a loan' to the mortgages screen when there is no mortgage", async () => {
    await render(<RentalRoiBreakEvenBreakdown property={aProperty("none")} />);
    const link = screen.getByRole("link", { name: MESSAGES.addLoan });
    expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith("/mortgages");
  });

  it("has no link when a mortgage is on file", async () => {
    await render(<RentalRoiBreakEvenBreakdown property={aProperty("records")} />);
    expect(screen.queryByRole("link", { name: MESSAGES.addLoan })).toBeNull();
  });
});
