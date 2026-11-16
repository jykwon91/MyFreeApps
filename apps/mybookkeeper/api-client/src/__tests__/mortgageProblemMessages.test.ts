import { describe, expect, it } from "vitest";
import { mortgageProblemMessages } from "../constants/mortgageProblemMessages";

describe("mortgageProblemMessages", () => {
  it("has plain wording for every problem the form can raise", () => {
    for (const message of Object.values(mortgageProblemMessages("."))) {
      expect(message.length).toBeGreaterThan(10);
    }
    expect(Object.keys(mortgageProblemMessages(".")).sort()).toEqual([
      "must_be_positive",
      "needs_balance",
      "needs_statement_date",
      "negative_amount",
      "not_a_number",
      "rate_decimals",
      "rate_out_of_range",
      "rate_type_required",
      "term_out_of_range",
    ]);
  });

  it("shows the example rate in the person's decimal mark", () => {
    expect(mortgageProblemMessages(",").rate_out_of_range).toContain("7,125");
    expect(mortgageProblemMessages(",").rate_decimals).toContain("7,125");
    expect(mortgageProblemMessages(".").rate_out_of_range).toContain("7.125");
  });
});
