import type { TransactionPreview } from "@mybookkeeper/api-client/types/transaction/TransactionPreview";
import { formatTag } from "@platform/core/utils/tag";
import { BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import { signedMoney, shortDate } from "../transactions/transactionDisplay";

export function previewName(row: TransactionPreview): string {
  return row.vendor || MESSAGES.untitledRow;
}

/** Money in is positive, as in the list. */
export function previewAmount(row: TransactionPreview): string {
  const amount = Number(row.amount);
  return signedMoney(row.transaction_type === "income" ? amount : -amount);
}

export function previewDetails(row: TransactionPreview): string {
  return `${shortDate(row.date)} · ${formatTag(row.category)}`;
}
