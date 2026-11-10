import { CHANNEL_OPTIONS } from "../src/constants/transactionCreateOptions";
import { isBulkApprovable } from "../src/features/transactions/bulkApprovable";
import { otherTaxYear, taxYearOf } from "../src/features/transactions/taxYear";
import { blankCreateValues, choiceLabel, createAmountError, createPayload } from "../src/features/transactions/transactionCreateValues";
import { nextToReview } from "../src/features/transactions/nextToReview";
import { displayAmount, isMoneyIn, rowAccessibilityLabel, shortDate, spokenAmount, spokenMoney } from "../src/features/transactions/transactionDisplay";
import { amountError, categoryChoices, changedFields, selectableProperties, toEditValues } from "../src/features/transactions/transactionEditValues";
import { activeFilterCount, filtersFromParams, filtersToParams, periodRange, reviewLink, reviewQueueParams, toListParams, transactionsLink } from "../src/features/transactions/transactionFilters";
import { approveFailureMessage, bulkDeleteConfirmBody, bulkDeleteConfirmTitle, bulkDeleteFailureMessage, othersUpdatedSentence, saveFailureMessage } from "../src/features/transactions/transactionMessages";
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
    expect(toListParams({ ...NO_FILTERS, view: "review", period: "lastYear" }, today)).toEqual({ to_review: true });
  });

  it("sends no-property as its own flag", () => {
    expect(toListParams({ ...NO_FILTERS, propertyId: UNASSIGNED_PROPERTY }, today)).toEqual({ unassigned: true });
    expect(toListParams({ ...NO_FILTERS, propertyId: "p1", vendor: " depot " }, today)).toEqual({ property_id: "p1", vendor: "depot" });
  });

  it("ignores made-up values in a link", () => {
    expect(filtersFromParams({ view: "nope", period: "nope", type: "nope" })).toEqual(NO_FILTERS);
  });

  it("doesn't count a period the review view ignores", () => {
    expect(activeFilterCount({ ...NO_FILTERS, view: "review", period: "lastYear" })).toBe(0);
  });

  it("builds the same list for review whether it starts in the app or a link", () => {
    expect(reviewQueueParams({ property: UNASSIGNED_PROPERTY, vendor: "acme" }, today)).toEqual(
      toListParams({ ...NO_FILTERS, view: "review", propertyId: UNASSIGNED_PROPERTY, vendor: "acme" }, today),
    );
  });

  it("carries only what's set into a review link", () => {
    expect(reviewLink("t1", { ...NO_FILTERS, view: "review", vendor: " " })).toBe("/transactions/t1?review=1");
  });

  it("lists a month from a link instead of the period", () => {
    expect(toListParams({ ...NO_FILTERS, period: "lastYear", month: "2026-02", approvedOnly: true }, today)).toEqual({
      start_date: "2026-02-01",
      end_date: "2026-02-28",
      status: "approved",
    });
    expect(activeFilterCount({ ...NO_FILTERS, month: "2026-02" })).toBe(1);
    expect(activeFilterCount({ ...NO_FILTERS, period: "thisYear", month: "2026-02" })).toBe(1);
  });

  it("takes a month from a link only when it's a real one", () => {
    expect(filtersFromParams({ month: "2026-03" }).month).toBe("2026-03");
    expect(filtersFromParams({ month: "2026-13" }).month).toBeNull();
    expect(filtersFromParams({ month: "March" }).month).toBeNull();
  });

  it("round-trips a month through a link", () => {
    expect(transactionsLink({ ...NO_FILTERS, month: "2026-03" })).toContain("&month=2026-03&");
    expect(filtersFromParams(filtersToParams({ ...NO_FILTERS, month: "2026-03" }))).toEqual({ ...NO_FILTERS, month: "2026-03" });
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

describe("a custom date range", () => {
  const custom = { ...NO_FILTERS, period: "custom" as const, startDate: "2026-02-10", endDate: "2026-03-05" };

  it("asks the server for exactly those two days", () => {
    expect(toListParams(custom, new Date(2026, 5, 1))).toEqual({ start_date: "2026-02-10", end_date: "2026-03-05" });
  });

  it("goes into the address and comes back out", () => {
    const params = filtersToParams(custom);
    expect(params).toMatchObject({ period: "custom", from: "2026-02-10", to: "2026-03-05" });
    expect(filtersFromParams(params)).toEqual(custom);
    expect(transactionsLink(custom)).toContain("from=2026-02-10");
  });

  it("leaves the days out of the address for any other period", () => {
    expect(filtersToParams({ ...NO_FILTERS, period: "thisYear", startDate: "2026-02-10", endDate: "2026-03-05" })).toMatchObject({ from: "", to: "" });
  });

  it.each([
    ["a missing end", { period: "custom", from: "2026-02-10" }],
    ["a bad day", { period: "custom", from: "2026-02-31x", to: "2026-03-05" }],
    ["an end before the start", { period: "custom", from: "2026-03-05", to: "2026-02-10" }],
    ["days without the period", { from: "2026-02-10", to: "2026-03-05" }],
  ])("falls back to all time for %s", (_name, params) => {
    expect(filtersFromParams(params)).toMatchObject({ period: "all", startDate: null, endDate: null });
  });

  it("counts as one filter, and a month link still wins", () => {
    expect(activeFilterCount(custom)).toBe(1);
    expect(toListParams({ ...custom, month: "2026-04" }, new Date(2026, 5, 1))).toEqual({ start_date: "2026-04-01", end_date: "2026-04-30" });
  });

  it("is ignored while looking at what's waiting for review", () => {
    expect(toListParams({ ...custom, view: "review" }, new Date(2026, 5, 1))).toEqual({ to_review: true });
  });
});

describe("tax years", () => {
  it("only asks when the date's year isn't the one it's filed under", () => {
    expect(otherTaxYear("2026-12-31", aTransaction())).toBeNull();
    expect(otherTaxYear("2027-01-01", aTransaction())).toBe(2027);
    expect(otherTaxYear("2026-01-02", aTransaction({ tax_year: 2025 }))).toBe(2026);
  });

  it("reads the year from the date without time zones", () => {
    expect(taxYearOf("2025-12-31")).toBe(2025);
  });
});

describe("adding by hand", () => {
  it("opens on today as an expense", () => {
    expect(blankCreateValues(new Date(2026, 6, 4))).toMatchObject({ date: "2026-07-04", type: "expense", category: "maintenance", propertyId: null, taxRelevant: false });
  });

  it("sends what the website sends", () => {
    const values = { ...blankCreateValues(new Date(2026, 6, 4)), amount: " 12.50 ", vendor: " Acme ", channel: "airbnb" };
    expect(createPayload(values)).toEqual({
      transaction_date: "2026-07-04",
      tax_year: 2026,
      vendor: "Acme",
      description: null,
      amount: "12.50",
      transaction_type: "expense",
      category: "maintenance",
      property_id: null,
      tax_relevant: false,
      channel: "airbnb",
      payment_method: null,
      is_manual: true,
    });
  });

  it("wants an amount above zero in dollars and cents", () => {
    const blank = blankCreateValues(new Date());
    expect(createAmountError(blank)).toBe("Enter an amount above $0.");
    expect(createAmountError({ ...blank, amount: "1.234" })).toBe("Use dollars and cents, like 84.20.");
    expect(createAmountError({ ...blank, amount: "84.20" })).toBeUndefined();
  });

  it("names the choice, and None for nothing", () => {
    expect(choiceLabel(CHANNEL_OPTIONS, "booking.com")).toBe("Booking.Com");
    expect(choiceLabel(CHANNEL_OPTIONS, "")).toBe("None");
  });
});

describe("bulk approve", () => {
  it("follows the website: waiting for review, and a property", () => {
    expect(isBulkApprovable(aTransaction({ status: "pending" }))).toBe(true);
    expect(isBulkApprovable(aTransaction({ status: "unverified" }))).toBe(true);
    expect(isBulkApprovable(aTransaction({ status: "pending", property_id: null }))).toBe(false);
    expect(isBulkApprovable(aTransaction({ status: "approved" }))).toBe(false);
    expect(isBulkApprovable(aTransaction({ status: "duplicate" }))).toBe(false);
  });

  it("words the delete question and its failures", () => {
    expect(bulkDeleteConfirmTitle(1)).toBe("Delete 1 transaction?");
    expect(bulkDeleteConfirmTitle(12)).toBe("Delete 12 transactions?");
    expect(bulkDeleteConfirmBody(1)).toBe("It'll be removed from your books. This can't be undone.");
    expect(bulkDeleteConfirmBody(2)).toBe("They'll be removed from your books. This can't be undone.");
    expect(bulkDeleteFailureMessage(undefined)).toContain("can't reach the server");
    expect(bulkDeleteFailureMessage({ status: 403 })).toContain("read-only");
    expect(bulkDeleteFailureMessage({ status: 500 })).toBe("I couldn't delete those. Want to try again?");
  });

});
