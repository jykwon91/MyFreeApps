import { describe, expect, it } from "vitest";
import { categoriesForType } from "../utils/categoriesForType";
import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES, TRANSFER_CATEGORY } from "../constants/transactionCategories";

describe("categoriesForType", () => {
  it("gives each type its own categories, and a transfer only 'transfer'", () => {
    expect(categoriesForType("income")).toEqual(INCOME_CATEGORIES);
    expect(categoriesForType("expense")).toEqual(EXPENSE_CATEGORY_LIST);
    expect(categoriesForType("transfer")).toEqual([TRANSFER_CATEGORY]);
  });

  it("falls back to the expense list before a form has a type", () => {
    expect(categoriesForType(undefined)).toEqual(EXPENSE_CATEGORY_LIST);
  });
});
