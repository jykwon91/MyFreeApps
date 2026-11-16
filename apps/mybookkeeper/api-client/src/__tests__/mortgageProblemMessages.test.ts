import { describe, expect, it } from "vitest";
import { MORTGAGE_PROBLEM_MESSAGES } from "../constants/mortgageProblemMessages";

describe("MORTGAGE_PROBLEM_MESSAGES", () => {
  it("has plain wording for every problem the form can raise", () => {
    for (const message of Object.values(MORTGAGE_PROBLEM_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
    }
    expect(Object.keys(MORTGAGE_PROBLEM_MESSAGES).sort()).toEqual([
      "must_be_positive",
      "needs_balance",
      "needs_statement_date",
      "negative_amount",
      "not_a_number",
      "rate_out_of_range",
      "rate_type_required",
      "term_out_of_range",
    ]);
  });
});
