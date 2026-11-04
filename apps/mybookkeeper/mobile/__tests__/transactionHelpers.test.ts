import { nextToReview } from "../src/features/transactions/nextToReview";
import { displayAmount, isMoneyIn, rowAccessibilityLabel, shortDate, spokenAmount, spokenMoney } from "../src/features/transactions/transactionDisplay";
import { amountError, categoryChoices, changedFields, selectableProperties, toEditValues } from "../src/features/transactions/transactionEditValues";
import { activeFilterCount, filtersFromParams, periodRange, reviewLink, reviewQueueParams, toListParams } from "../src/features/transactions/transactionFilters";
import { approveFailureMessage, othersUpdatedSentence, saveFailureMessage } from "../src/features/transactions/transactionMessages";
import { NO_FILTERS, UNASSIGNED_PROPERTY } from "../src/constants/transactionFilters";
import { aProperty, aTransaction } from "../test-support/transactionsServer";

describe("amounts", () => {
  it("signs money in and money out", () => {
    expect(displayAmount(aTransaction({ transaction_type: "income", amount: "1200.00" }))).toBe("+$1,200.00");
    expect(displayAmount(aTransaction({ amount: "84.20" }))).toBe("\u2212$84.20");
  });

  it("treats a negative expense as a refund", () => {
    const refund = aTransaction({ amount: "-20.00" });
    expect(displayAmount(refund)).toBe("+$20.00");
    expect(isMoneyIn(refund)).toBe(true);
  });

  it("says money in words", () => {
    expect(spokenMoney(84.2)).toBe("84 dollars and 20 cents");
    expect(spokenMoney(1)).toBe("1 dollar");
    expect(spokenMoney(1200)).toBe("1,200 dollars");
  });

  it("says negative income as minus", () => {
    expect(spokenAmount(aTransaction({ transaction_type: "income", amount: "-20.00" }))).toBe("minus 20 dollars");
    expect(spokenAmount(aTransaction({ amount: "-20.00" }))).toBe("20 dollars");
  });

  it("reads a row out in a useful order", () => {
    const row = aTransaction({ status: "needs_review" });
    expect(rowAccessibilityLabel(row, "Oak Street")).toBe(
      "Maintenance expense, Home Depot, 84 dollars and 20 cents, March 14, 2026, Oak Street, needs review",
    );
  });
});

describe("dates", () => {
  it("doesn't slip back a day in a US time zone", () => {
    expect(shortDate("2026-03-01", new Date(2026, 5, 1))).toBe("Mar 1");
  });

  it("adds the year when it isn't this year", () => {
    expect(shortDate("2025-12-31", new Date(2026, 5, 1))).toBe("Dec 31, 2025");
  });
});

describe("filters", () => {
  const today = new Date(2026, 0, 15);

  it("works out last month across a new year", () => {
    expect(periodRange("lastMonth", today)).toEqual({ start_date: "2025-12-01", end_date: "2025-12-31" });
  });

  it("works out the end of a short month", () => {
    expect(periodRange("thisMonth", new Date(2026, 1, 10))).toEqual({ start_date: "2026-02-01", end_date: "2026-02-28" });
  });

  it("ignores the period when showing what's waiting for review", () => {
    expect(toListParams({ ...NO_FILTERS, view: "review", period: "lastYear" }, "", today)).toEqual({ to_review: true });
  });

  it("sends no-property as its own flag", () => {
    expect(toListParams({ ...NO_FILTERS, propertyId: UNASSIGNED_PROPERTY }, "", today)).toEqual({ unassigned: true });
    expect(toListParams({ ...NO_FILTERS, propertyId: "p1" }, " depot ", today)).toEqual({ property_id: "p1", vendor: "depot" });
  });

  it("ignores made-up values in a link", () => {
    expect(filtersFromParams({ view: "nope", period: "nope", type: "nope" })).toEqual(NO_FILTERS);
  });

  it("doesn't count a period the review view ignores", () => {
    expect(activeFilterCount({ ...NO_FILTERS, view: "review", period: "lastYear" })).toBe(0);
  });

  it("builds the same list for review whether it starts in the app or a link", () => {
    expect(reviewQueueParams({ property: UNASSIGNED_PROPERTY, vendor: "acme" }, today)).toEqual(
      toListParams({ ...NO_FILTERS, view: "review", propertyId: UNASSIGNED_PROPERTY }, "acme", today),
    );
  });

  it("carries only what's set into a review link", () => {
    expect(reviewLink("t1", { ...NO_FILTERS, view: "review" }, " ")).toBe("/transactions/t1?review=1");
  });

  it("counts filters but not the view", () => {
    expect(activeFilterCount({ ...NO_FILTERS, view: "review", type: "income", category: "maintenance" })).toBe(2);
  });
});

describe("nextToReview", () => {
  const rows = ["a", "b", "c"].map((id) => aTransaction({ id }));

  it("goes to the next one in the order they were working through", () => {
    expect(nextToReview(rows, [rows[0]!, rows[2]!], "b")).toBe("c");
  });

  it("skips one somebody else already dealt with", () => {
    expect(nextToReview(rows, [rows[2]!], "a")).toBe("c");
  });

  it("wraps to what's left when the last one is approved", () => {
    expect(nextToReview(rows, [rows[0]!], "c")).toBe("a");
  });

  it("is done when nothing is left", () => {
    expect(nextToReview(rows, [], "c")).toBeNull();
  });

  it("never returns the one just approved, even if the refresh still has it", () => {
    expect(nextToReview(rows, [rows[1]!], "b")).toBeNull();
  });
});

describe("the edit form", () => {
  const original = aTransaction();
  const values = toEditValues(original);

  it("sends nothing when nothing changed, even if the amount was retyped", () => {
    expect(changedFields({ ...values, amount: "84.2" }, original)).toEqual({});
  });

  it("sends only what changed", () => {
    expect(changedFields({ ...values, category: "utilities" }, original)).toEqual({ category: "utilities" });
  });

  it("clears a blank vendor, description or property", () => {
    expect(changedFields({ ...values, vendor: " ", description: "", propertyId: null }, original)).toEqual({
      vendor: null,
      description: null,
      property_id: null,
    });
  });

  it("leaves an untouched refund alone but checks a changed amount", () => {
    const refund = aTransaction({ amount: "-20.00" });
    const refundValues = toEditValues(refund);
    expect(amountError(refundValues, refund)).toBeUndefined();
    expect(amountError({ ...refundValues, amount: "-21" }, refund)).toBe("Use dollars and cents, like 84.20.");
  });

  it.each([
    ["", "Enter an amount above $0."],
    ["0", "Enter an amount above $0."],
    ["1.234", "Use dollars and cents, like 84.20."],
    ["abc", "Use dollars and cents, like 84.20."],
    ["12.5", undefined],
  ])("checks an amount of %p", (amount, expected) => {
    expect(amountError({ ...values, amount }, original)).toBe(expected);
  });

  it("keeps a category the list doesn't offer, so saving doesn't lose it", () => {
    expect(categoryChoices("expense", "business_income")[0]).toBe("business_income");
    expect(categoryChoices("expense", "maintenance").filter((c) => c === "maintenance")).toHaveLength(1);
  });

  it("offers a retired property only to the row that already has it", () => {
    const retired = aProperty({ id: "old", is_active: false });
    expect(selectableProperties([retired, aProperty()], null).map((p) => p.id)).toEqual(["p1"]);
    expect(selectableProperties([retired, aProperty()], "old").map((p) => p.id)).toEqual(["old", "p1"]);
  });
});

describe("messages", () => {
  it("never passes on the server's own words", () => {
    const failure = { status: 422, data: { detail: "value_error.decimal" } };
    expect(saveFailureMessage(failure)).toBe("I couldn't save that. Want to try again?");
    expect(approveFailureMessage(failure)).toBe("I couldn't approve that one. Want to try again?");
  });

  it("says when the server can't be reached", () => {
    expect(saveFailureMessage({ data: "Network Error" })).toContain("can't reach the server");
  });

  it("says how many others changed, only if any did", () => {
    expect(othersUpdatedSentence({ retroactive_count: 0 } as never, "Acme")).toBe("");
    expect(othersUpdatedSentence({ retroactive_count: 1 } as never, "Acme")).toBe(" I also updated 1 other Acme transaction.");
    expect(othersUpdatedSentence({ retroactive_count: 3 } as never, null)).toBe(" I also updated 3 other transactions.");
  });
});
