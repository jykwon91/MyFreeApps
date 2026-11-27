import type { Transaction } from "../types/transaction/transaction";
import type { TransactionSelectionRef } from "../types/transaction/TransactionSelectionRef";
import { isSplit } from "./propertySplit";

export function toSelectionRef({ id, property_id, property_splits, status }: Transaction): TransactionSelectionRef {
  return { id, property_id, is_split: isSplit({ property_splits }), status };
}

/** Whether the row has a property: its own, or a split across several. */
export function hasProperty(ref: TransactionSelectionRef): boolean {
  return ref.property_id !== null || ref.is_split;
}

export function refsById(refs: readonly TransactionSelectionRef[]): Map<string, TransactionSelectionRef> {
  return new Map(refs.map((ref) => [ref.id, ref]));
}
