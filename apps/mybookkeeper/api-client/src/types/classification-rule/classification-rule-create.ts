import type { TransactionScope } from "../transaction/TransactionScope";
import type { ClassificationRuleMatchType } from "./classification-rule-match-type";

/** POST /classification-rules. A rule names one property, or two or more to split across, never both. */
export interface ClassificationRuleCreate {
  match_type: ClassificationRuleMatchType;
  match_pattern: string;
  category: string;
  transaction_scope?: TransactionScope | null;
  property_id?: string | null;
  split_property_ids?: string[];
}
