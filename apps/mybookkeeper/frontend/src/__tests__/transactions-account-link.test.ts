import { describe, expect, it } from "vitest";
import {
  accountFromParams,
  transactionsForAccountPath,
  withoutAccountParam,
} from "@/shared/lib/transactions-account-link";

const ID = "00000000-0000-0000-0000-0000000000a2";

describe("transactions-account-link", () => {
  it("builds the Transactions address for one account", () => {
    expect(transactionsForAccountPath(ID)).toBe(`/transactions?account=${ID}`);
  });

  it("reads the account back from that address", () => {
    expect(accountFromParams(new URLSearchParams(`account=${ID}`))).toBe(ID);
  });

  it("ignores a missing or malformed account", () => {
    expect(accountFromParams(new URLSearchParams(""))).toBeNull();
    expect(accountFromParams(new URLSearchParams("account=not-an-account"))).toBeNull();
  });

  it("drops only the account, leaving the rest of the address and the original alone", () => {
    const params = new URLSearchParams(`tab=transactions&account=${ID}`);
    expect(withoutAccountParam(params).toString()).toBe("tab=transactions");
    expect(params.get("account")).toBe(ID);
  });
});
