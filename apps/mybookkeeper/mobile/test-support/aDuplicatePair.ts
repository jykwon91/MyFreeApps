import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import type { DuplicateTransaction } from "@mybookkeeper/api-client/types/transaction/DuplicateTransaction";

export function aDuplicateSide(overrides: Partial<DuplicateTransaction> = {}): DuplicateTransaction {
  return {
    id: "t1",
    transaction_date: "2026-03-14",
    vendor: "Home Depot",
    description: null,
    amount: "84.20",
    transaction_type: "expense",
    category: "maintenance",
    property_id: "p1",
    payment_method: null,
    channel: null,
    tags: [],
    status: "pending",
    source_document_id: null,
    source_file_name: null,
    is_manual: false,
    created_at: "2026-03-15T00:00:00Z",
    linked_document_ids: [],
    ...overrides,
  };
}

export function aDuplicatePair(overrides: Partial<DuplicatePair> = {}): DuplicatePair {
  const a = overrides.transaction_a ?? aDuplicateSide({ id: "a1", source_file_name: "invoice.pdf", source_document_id: "d1" });
  const b = overrides.transaction_b ?? aDuplicateSide({ id: "b1", transaction_date: "2026-03-16", vendor: "HOME DEPOT #4410", source_file_name: "bank.csv" });
  return { id: `${a.id}_${b.id}`, transaction_a: a, transaction_b: b, date_diff_days: 2, property_match: true, confidence: "high", ...overrides };
}
