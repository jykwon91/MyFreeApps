import { describe, expect, it } from "vitest";
import { transactionAccountLabel } from "../utils/transactionAccountLabel";

const accounts = new Map([["c", "Checking"], ["s", "Sapphire ··1234"]]);

describe("transactionAccountLabel", () => {
  it("names the account, or both sides of a transfer", () => {
    expect(transactionAccountLabel({ account_id: "c", transfer_to_account_id: null }, accounts, "?")).toBe("Checking");
    expect(transactionAccountLabel({ account_id: "c", transfer_to_account_id: "s" }, accounts, "?")).toBe("Checking → Sapphire ··1234");
    expect(transactionAccountLabel({ account_id: null, transfer_to_account_id: "s" }, accounts, "?")).toBe("→ Sapphire ··1234");
  });

  it("is nothing with no account, and unknown for one that's gone", () => {
    expect(transactionAccountLabel({ account_id: null, transfer_to_account_id: null }, accounts, "?")).toBeNull();
    expect(transactionAccountLabel({ account_id: "gone", transfer_to_account_id: null }, accounts, "Deleted account")).toBe("Deleted account");
  });
});
