/**
 * A fake GET /transactions/page for the drill-down tests: `rows` a page at a time by offset, refusing a limit above
 * the server's cap, with the count and amount total of every row on every page, as the server sends them.
 */
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionListPage } from "@mybookkeeper/api-client/types/transaction/TransactionListPage";
import { answerListPage } from "./paged-list-server";

export function aDrillDownTransaction(index: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `txn-${index}`,
    organization_id: "org-1",
    user_id: "user-1",
    property_id: "prop-1",
    extraction_id: null,
    transaction_date: "2024-06-15",
    tax_year: 2024,
    sub_category: null,
    usage_quantity: null,
    usage_unit: null,
    service_period_start: null,
    service_period_end: null,
    vendor: `Vendor ${index}`,
    vendor_id: null,
    description: null,
    amount: "10.00",
    transaction_type: "expense",
    category: "contract_work",
    tags: ["contract_work"],
    tax_relevant: true,
    schedule_e_line: null,
    is_capital_improvement: false,
    placed_in_service_date: null,
    channel: null,
    address: null,
    payment_method: null,
    status: "approved",
    review_fields: null,
    reconciled: false,
    reconciled_at: null,
    is_manual: false,
    deleted_at: null,
    created_at: "2024-06-15T00:00:00Z",
    updated_at: "2024-06-15T00:00:00Z",
    source_document_id: null,
    source_file_name: null,
    linked_document_ids: [],
    external_id: null,
    external_source: null,
    is_pending: false,
    activity_id: null,
    account_id: null,
    transfer_to_account_id: null,
    review_reason: null,
    applicant_id: null,
    attribution_source: null,
    payer_name: null,
    transaction_scope: "rental",
    spending_category_id: null,
    ...overrides,
  };
}

export function answerDrillDownPage(
  rows: readonly Transaction[],
  params: Readonly<Record<string, unknown>>,
  amountTotal: string,
): TransactionListPage {
  return { ...answerListPage(rows, params), amount_total: amountTotal };
}
