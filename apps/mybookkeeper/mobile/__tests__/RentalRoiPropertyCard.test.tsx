import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../src/constants/rentalRoi";
import RentalRoiPropertyCard from "../src/features/analytics/RentalRoiPropertyCard";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path), navigate: jest.fn() } }));

function aProperty(overrides: Partial<RentalRoiProperty> = {}): RentalRoiProperty {
  return {
    property_id: "p1",
    property_name: "Elm St",
    months_averaged: 6,
    has_purchase_price: true,
    mortgage_source: "records",
    break_even_monthly_cents: 150000,
    target_monthly_cents: 200000,
    actual_revenue_monthly_cents: 180000,
    gap_monthly_cents: -20000,
    gap_basis: "target",
    cash_invested_cents: 500000,
    noi_annual_cents: 1800000,
    cap_rate_pct: "11.52",
    cash_on_cash_pct: "21.60",
    is_personal_home: false,
    cost_breakdown: {
      debt_service_monthly_cents: 100000,
      operating_monthly_cents: 50000,
      mortgage_lines: [],
      operating_lines: [],
      escrow_covered_lines: [],
    },
    ...overrides,
  };
}

describe("RentalRoiPropertyCard", () => {
  beforeEach(() => mockPush.mockClear());

  it("shows both break-even and target when a target exists", async () => {
    await render(<RentalRoiPropertyCard property={aProperty()} />);
    expect(screen.getByText(MESSAGES.breakEven)).toBeTruthy();
    expect(screen.getByText(MESSAGES.target)).toBeTruthy();
    expect(screen.getByText("$1,500/mo")).toBeTruthy();
    expect(screen.getByText("$2,000/mo")).toBeTruthy();
  });

  it("keeps the break-even and offers the way to a target when there is none", async () => {
    await render(<RentalRoiPropertyCard property={aProperty({ target_monthly_cents: null, gap_basis: "break_even" })} />);
    expect(screen.getByText(MESSAGES.breakEven)).toBeTruthy();
    expect(screen.getByText("$1,500/mo")).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: MESSAGES.addLoanOriginalAmount }));
    expect(mockPush).toHaveBeenCalledWith("/mortgages");
  });
});
