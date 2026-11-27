import { describe, it, expect } from "vitest";
import { payeeRuleFromTransaction } from "@/shared/utils/payee-rule-from-transaction";
import { ruleFilingFacts } from "@/shared/utils/rule-filing-facts";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

const base = {
  vendor: "  Zelle payment to Silvia ",
  transaction_type: "expense",
  category: "cleaning_expense",
  transaction_scope: "rental",
  property_id: "p-6734",
  property_splits: [],
} as unknown as Transaction;

describe("payeeRuleFromTransaction", () => {
  it("files future payments under the row's one property", () => {
    expect(payeeRuleFromTransaction(base)).toEqual({
      match_type: "vendor",
      match_pattern: "Zelle payment to Silvia",
      category: "cleaning_expense",
      transaction_scope: "rental",
      property_id: "p-6734",
    });
  });

  it("splits evenly across the properties a split row is split across, leaving out a deleted one", () => {
    const split = {
      ...base,
      property_id: null,
      property_splits: [
        { property_id: "p-6732", amount: "50.00" },
        { property_id: null, amount: "25.00" },
        { property_id: "p-6738", amount: "25.00" },
      ],
    } as Transaction;
    expect(payeeRuleFromTransaction(split)).toMatchObject({ split_property_ids: ["p-6732", "p-6738"] });
    expect(payeeRuleFromTransaction(split)).not.toHaveProperty("property_id");
  });

  it("names no property for personal spending", () => {
    const rule = payeeRuleFromTransaction({ ...base, transaction_scope: "personal" } as Transaction);
    expect(rule).toEqual({
      match_type: "vendor", match_pattern: "Zelle payment to Silvia", category: "cleaning_expense", transaction_scope: "personal",
    });
  });

  it("makes no rule for a row with no payee, or a transfer", () => {
    expect(payeeRuleFromTransaction({ ...base, vendor: "  " } as Transaction)).toBeNull();
    expect(payeeRuleFromTransaction({ ...base, vendor: null } as Transaction)).toBeNull();
    expect(payeeRuleFromTransaction({ ...base, transaction_type: "transfer" } as Transaction)).toBeNull();
  });
});

describe("ruleFilingFacts", () => {
  const rule = {
    transaction_scope: null,
    property_id: null,
    split_property_ids: [],
  } as unknown as ClassificationRule;
  const names = new Map([["p-6732", "6732 Peerless"], ["p-6734", "6734 Peerless"]]);

  it("says nothing for a rule that only sets a category", () => {
    expect(ruleFilingFacts(rule, names)).toEqual([]);
  });

  it("names the scope and the property", () => {
    expect(ruleFilingFacts({ ...rule, transaction_scope: "rental", property_id: "p-6734" }, names)).toEqual(["Rental", "6734 Peerless"]);
  });

  it("names every property of a split, an unknown one as such", () => {
    expect(ruleFilingFacts({ ...rule, split_property_ids: ["p-6732", "gone"] }, names)).toEqual([
      "Split evenly: 6732 Peerless, Unknown property",
    ]);
  });
});
