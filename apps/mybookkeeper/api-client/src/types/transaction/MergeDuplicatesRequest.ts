import type { MergeFieldSide } from "./MergeFieldSide";

export interface MergeDuplicatesRequest {
  transaction_a_id: string;
  transaction_b_id: string;
  surviving_id: string;
  field_overrides: Record<string, MergeFieldSide>;
}
