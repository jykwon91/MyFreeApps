import { describe, expect, it } from "vitest";
import { DEPRECIATION_INPUT_MESSAGES } from "../constants/depreciationInputs";
import { MONEY_INPUT_MESSAGES } from "../constants/moneyInput";
import {
  depreciationInputChanges,
  landValueProblem,
  placedInServiceProblem,
  showsDepreciationInputs,
} from "../utils/depreciationInputs";

describe("showsDepreciationInputs", () => {
  it("is only for a rental", () => {
    expect(showsDepreciationInputs("investment")).toBe(true);
    expect(showsDepreciationInputs("primary_residence")).toBe(false);
    expect(showsDepreciationInputs("second_home")).toBe(false);
    expect(showsDepreciationInputs("unclassified")).toBe(false);
  });
});

describe("landValueProblem", () => {
  it("accepts blank, zero and up to the purchase price", () => {
    expect(landValueProblem("", "300000.00", null, ".")).toBeUndefined();
    expect(landValueProblem("0", "300000.00", null, ".")).toBeUndefined();
    expect(landValueProblem("$25,000", "300000.00", null, ".")).toBeUndefined();
    expect(landValueProblem("300000", "300000.00", null, ".")).toBeUndefined();
  });

  it("refuses land worth more than the purchase price", () => {
    expect(landValueProblem("300000.01", "300000.00", null, ".")).toBe(DEPRECIATION_INPUT_MESSAGES.landValueOverPrice);
  });

  it("needs a purchase price first", () => {
    expect(landValueProblem("25000", null, null, ".")).toBe(DEPRECIATION_INPUT_MESSAGES.landValueNeedsPrice);
  });

  it("refuses a negative or unreadable amount", () => {
    expect(landValueProblem("-5", "300000.00", null, ".")).toBe(MONEY_INPUT_MESSAGES.notDollarsAndCents("."));
    expect(landValueProblem("abc", "300000.00", null, ".")).toBe(MONEY_INPUT_MESSAGES.notDollarsAndCents("."));
  });

  it("won't clear a saved land value", () => {
    expect(landValueProblem("", "300000.00", "25000.00", ".")).toBe(DEPRECIATION_INPUT_MESSAGES.landValueRemoved);
  });
});

describe("placedInServiceProblem", () => {
  it("accepts blank, past and today", () => {
    expect(placedInServiceProblem(null, null, "2026-11-19")).toBeUndefined();
    expect(placedInServiceProblem("2023-03-15", null, "2026-11-19")).toBeUndefined();
    expect(placedInServiceProblem("2026-11-19", null, "2026-11-19")).toBeUndefined();
  });

  it("refuses a future date", () => {
    expect(placedInServiceProblem("2026-11-20", null, "2026-11-19")).toBe(DEPRECIATION_INPUT_MESSAGES.placedInServiceInFuture);
  });

  it("won't clear a saved date", () => {
    expect(placedInServiceProblem(null, "2023-03-15", "2026-11-19")).toBe(DEPRECIATION_INPUT_MESSAGES.placedInServiceRemoved);
  });
});

describe("depreciationInputChanges", () => {
  const saved = { land_value: "25000.00", date_placed_in_service: "2023-03-15" };

  it("sends what changed, as the API reads it", () => {
    expect(depreciationInputChanges("$30,000", "2023-04-01", saved, ".")).toEqual({
      land_value: "30000.00",
      date_placed_in_service: "2023-04-01",
    });
  });

  it("sends nothing when the values are the saved ones", () => {
    expect(depreciationInputChanges("25000", "2023-03-15", saved, ".")).toEqual({});
  });

  it("sends a zero land value", () => {
    expect(depreciationInputChanges("0", null, { land_value: null, date_placed_in_service: null }, ".")).toEqual({ land_value: "0.00" });
  });

  it("leaves blank out", () => {
    expect(depreciationInputChanges("", null, { land_value: null, date_placed_in_service: null }, ".")).toEqual({});
  });
});
