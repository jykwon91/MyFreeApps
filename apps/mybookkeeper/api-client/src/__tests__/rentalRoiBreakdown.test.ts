import { describe, expect, it } from "vitest";
import {
  describeCostLineAverage,
  formatExactMoneyCents,
  rentalRoiCostLineLabel,
  rentalRoiPeriodLabel,
} from "../utils/rentalRoi";

describe("break-even breakdown copy", () => {
  it("shows cents", () => {
    expect(formatExactMoneyCents(120050)).toBe("$1,200.50");
  });

  it("names loan parts briefly and other lines by their category", () => {
    expect(rentalRoiCostLineLabel("mortgage_escrow")).toBe("Escrow");
    expect(rentalRoiCostLineLabel("contract_work")).toBe("Contract Work");
  });

  it("says how a line was averaged", () => {
    expect(describeCostLineAverage(720000, 12)).toBe("$7,200.00 ÷ 12 months");
    expect(describeCostLineAverage(5000, 1)).toBe("$50.00 ÷ 1 month");
  });

  it("names the full window", () => {
    expect(rentalRoiPeriodLabel("2025-11-01", "2026-10-31", 12)).toBe("Average of Nov 2025 – Oct 2026 (12 months)");
  });

  it("says when a rental started part-way through", () => {
    expect(rentalRoiPeriodLabel("2025-11-01", "2026-10-31", 8)).toBe("Average of the 8 months it was renting, through Oct 2026");
  });
});
