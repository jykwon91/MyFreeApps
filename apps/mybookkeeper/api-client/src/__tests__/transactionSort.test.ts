import { describe, expect, it } from "vitest";
import { TAX_RELEVANT_OPTIONS } from "../constants/taxRelevantOptions";
import { DEFAULT_TRANSACTION_SORT_FIELD, TRANSACTION_SORT_FIELDS } from "../constants/transactionSort";
import { taxRelevantParam } from "../utils/taxRelevantParam";

describe("transaction sort and tax choices", () => {
  it("offers the default order among the columns, each once", () => {
    const values = TRANSACTION_SORT_FIELDS.map((field) => field.value);
    expect(values).toContain(DEFAULT_TRANSACTION_SORT_FIELD);
    expect(new Set(values).size).toBe(values.length);
  });

  it("writes the tax choices as the API reads a boolean", () => {
    expect(TAX_RELEVANT_OPTIONS.map((option) => [option.label, taxRelevantParam(option.value)])).toEqual([
      ["Yes", true],
      ["No", false],
    ]);
  });
});
