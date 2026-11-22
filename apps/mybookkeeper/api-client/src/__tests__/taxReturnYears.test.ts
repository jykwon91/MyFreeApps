import { describe, expect, it } from "vitest";
import { taxReturnYears } from "../utils/taxReturnYears";

describe("taxReturnYears", () => {
  it("lists each return year once, newest first", () => {
    expect(taxReturnYears([{ tax_year: 2019 }, { tax_year: 2025 }, { tax_year: 2019 }])).toEqual([2025, 2019]);
  });

  it("is empty when there are no returns", () => {
    expect(taxReturnYears([])).toEqual([]);
  });
});
