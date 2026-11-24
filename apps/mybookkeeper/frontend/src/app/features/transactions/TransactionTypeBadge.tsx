import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { TRANSACTION_TYPE_LABELS } from "@mybookkeeper/api-client/constants/transactionTypes";
import { TRANSACTION_TYPE_BADGE_CLASSES } from "@/shared/lib/transaction-type-badge-classes";

export default function TransactionTypeBadge({ type }: { type: TransactionType }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TRANSACTION_TYPE_BADGE_CLASSES[type]}`}>
      {TRANSACTION_TYPE_LABELS[type]}
    </span>
  );
}
