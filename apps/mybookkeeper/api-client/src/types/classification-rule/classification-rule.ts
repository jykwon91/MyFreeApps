import type { TransactionScope } from "../transaction/TransactionScope";

export interface ClassificationRule {
  id: string;
  organization_id: string;
  match_type: string;
  match_pattern: string;
  match_context: string | null;
  category: string;
  property_id: string | null;
  activity_id: string | null;
  /** The scope the rule files payments under; null leaves each payment's own scope. */
  transaction_scope: TransactionScope | null;
  /** Properties the rule splits each payment evenly across, in order; empty when it doesn't split. */
  split_property_ids: string[];
  source: string;
  priority: number;
  times_applied: number;
  is_active: boolean;
  created_at: string;
}
