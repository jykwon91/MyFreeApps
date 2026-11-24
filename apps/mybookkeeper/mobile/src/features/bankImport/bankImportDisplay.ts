import type { TransactionPreview } from "@mybookkeeper/api-client/types/transaction/TransactionPreview";
import { formatCurrency } from "@platform/core/utils/currency";
import { formatTag } from "@platform/core/utils/tag";
import { BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import { signedMoney, shortDate } from "../transactions/transactionDisplay";

export function previewName(row: TransactionPreview): string {
  return row.vendor || MESSAGES.untitledRow;
}

/** Money in is positive, as in the list; a transfer is unsigned. */
export function previewAmount(row: TransactionPreview): string {
  const amount = Number(row.amount);
  if (row.transaction_type === "transfer") return formatCurrency(Math.abs(amount));
  return signedMoney(row.transaction_type === "income" ? amount : -amount);
}

export function previewDetails(row: TransactionPreview): string {
  return `${shortDate(row.date)} · ${formatTag(row.category)}`;
}
