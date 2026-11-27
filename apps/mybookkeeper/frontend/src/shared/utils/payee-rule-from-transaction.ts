import { PERSONAL_TRANSACTION_SCOPE } from "@mybookkeeper/api-client/constants/transactionScopes";
import type { ClassificationRuleCreate } from "@mybookkeeper/api-client/types/classification-rule/classification-rule-create";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { canFilePayeeLikeThis } from "./can-file-payee-like-this";

const MIN_SPLIT_PROPERTIES = 2;

/**
 * A payee rule that files future payments from this payee the way this one is filed:
 * its category and scope, and its property, or an even split across the properties it is split across.
 * Null when the row names no payee or is a transfer.
 */
export function payeeRuleFromTransaction(transaction: Transaction): ClassificationRuleCreate | null {
  if (!canFilePayeeLikeThis(transaction.vendor, transaction.transaction_type)) return null;
  const rule: ClassificationRuleCreate = {
    match_type: "vendor",
    match_pattern: (transaction.vendor ?? "").trim(),
    category: transaction.category,
    transaction_scope: transaction.transaction_scope,
  };
  if (transaction.transaction_scope === PERSONAL_TRANSACTION_SCOPE) return rule;
  const splitIds = transaction.property_splits.flatMap((share) => (share.property_id === null ? [] : [share.property_id]));
  if (splitIds.length >= MIN_SPLIT_PROPERTIES) return { ...rule, split_property_ids: splitIds };
  return { ...rule, property_id: transaction.property_id };
}
