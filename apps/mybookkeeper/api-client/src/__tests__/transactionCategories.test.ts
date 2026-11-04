import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES } from "../constants/transactionCategories";

describe("transaction categories", () => {
  it("keeps income categories out of the expense list", () => {
    const expense: readonly string[] = EXPENSE_CATEGORY_LIST;
    expect(INCOME_CATEGORIES.filter((category) => category !== "uncategorized" && expense.includes(category))).toEqual([]);
  });
});
