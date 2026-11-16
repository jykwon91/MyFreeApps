import { describe, expect, it } from "vitest";
import type { TransactionSelectionRef } from "../types/transaction/TransactionSelectionRef";
import { addTicks, intersectTicks, NO_TICKS, removeTicks, tickCount } from "../utils/transactionTicks";

function ref(id: string, status: TransactionSelectionRef["status"] = "pending"): TransactionSelectionRef {
  return { id, property_id: "p1", status };
}

describe("transaction ticks", () => {
  it("knows the filters a first tick matches, and loses that once a row of unknown match joins", () => {
    const first = addTicks(NO_TICKS, [ref("a")], "vendor=x");
    expect(first.checkKey).toBe("vendor=x");
    expect(addTicks(first, [ref("b")], "vendor=x").checkKey).toBe("vendor=x");
    expect(addTicks(first, [ref("b")], null).checkKey).toBeNull();
    expect(addTicks(first, [ref("b")], "vendor=y").checkKey).toBeNull();
  });

  it("keeps only the ticked rows the new filters still match, with their fresh status", () => {
    const ticks = addTicks(NO_TICKS, [ref("a"), ref("b"), ref("c")], "");
    const checked = intersectTicks(ticks, [ref("b", "approved"), ref("z")], "statuses=approved");
    expect(checked).toEqual({ refs: { b: ref("b", "approved") }, checkKey: "statuses=approved" });
  });

  it("unticks rows without forgetting what the rest match", () => {
    const ticks = addTicks(NO_TICKS, [ref("a"), ref("b")], "vendor=x");
    const after = removeTicks(ticks, ["a"]);
    expect(tickCount(after)).toBe(1);
    expect(after.checkKey).toBe("vendor=x");
  });
});
