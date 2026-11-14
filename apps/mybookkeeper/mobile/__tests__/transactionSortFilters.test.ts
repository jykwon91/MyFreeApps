import { NO_FILTERS } from "../src/constants/transactionFilters";
import { sortLabel, taxFilterLabel } from "../src/features/transactions/transactionDisplay";
import {
  activeFilterCount,
  filtersFromParams,
  filtersToParams,
  isSorted,
  reviewLink,
  reviewQueueParams,
  toListParams,
  transactionsLink,
} from "../src/features/transactions/transactionFilters";

const today = new Date(2026, 2, 14);

describe("transaction sort and tax filter helpers", () => {
  it("sends an order only when it isn't newest first", () => {
    expect(toListParams(NO_FILTERS, today)).toEqual({});
    expect(toListParams({ ...NO_FILTERS, sortDir: "asc" }, today)).toEqual({ sort_by: "transaction_date", sort_dir: "asc" });
    expect(toListParams({ ...NO_FILTERS, sortBy: "amount" }, today)).toEqual({ sort_by: "amount", sort_dir: "desc" });
  });

  it("leaves the review queue in its own order but narrows it by tax", () => {
    expect(toListParams({ ...NO_FILTERS, view: "review", sortBy: "amount", taxRelevant: "true" }, today)).toEqual({ to_review: true, tax_relevant: true });
  });

  it("sends the tax choice as a boolean", () => {
    expect(toListParams({ ...NO_FILTERS, taxRelevant: "false" }, today)).toEqual({ tax_relevant: false });
  });

  it("counts the tax choice as a filter and the order as not one", () => {
    expect(activeFilterCount({ ...NO_FILTERS, taxRelevant: "true" })).toBe(1);
    expect(activeFilterCount({ ...NO_FILTERS, sortBy: "vendor", sortDir: "asc" })).toBe(0);
    expect(isSorted({ ...NO_FILTERS, sortBy: "vendor" })).toBe(true);
    expect(isSorted(NO_FILTERS)).toBe(false);
  });

  it("keeps the tax choice and the order in the address, and ignores what it can't read", () => {
    const filters = { ...NO_FILTERS, taxRelevant: "false" as const, sortBy: "category" as const, sortDir: "asc" as const };
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
    expect(transactionsLink(filters)).toContain("tax=false&sort=category&order=asc");
    expect(filtersFromParams({ tax: "maybe", sort: "description", order: "sideways" })).toEqual(NO_FILTERS);
  });

  it("takes the tax choice into review, so the next one comes from the same list", () => {
    const link = reviewLink("t1", { ...NO_FILTERS, view: "review", taxRelevant: "true" });
    expect(link).toBe("/transactions/t1?review=1&tax=true");
    expect(reviewQueueParams({ tax: "true" }, today)).toEqual({ to_review: true, tax_relevant: true });
  });

  it("names the choices as the summary line shows them", () => {
    expect(taxFilterLabel("true")).toBe("In tax report");
    expect(taxFilterLabel("false")).toBe("Not in tax report");
    expect(sortLabel("transaction_type", "desc")).toBe("Type, descending");
  });
});
