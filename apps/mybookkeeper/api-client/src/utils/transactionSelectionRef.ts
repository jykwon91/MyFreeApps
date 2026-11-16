import type { Transaction } from "../types/transaction/transaction";
import type { TransactionSelectionRef } from "../types/transaction/TransactionSelectionRef";

export function toSelectionRef({ id, property_id, status }: Transaction): TransactionSelectionRef {
  return { id, property_id, status };
}

export function refsById(refs: readonly TransactionSelectionRef[]): Map<string, TransactionSelectionRef> {
  return new Map(refs.map((ref) => [ref.id, ref]));
}
