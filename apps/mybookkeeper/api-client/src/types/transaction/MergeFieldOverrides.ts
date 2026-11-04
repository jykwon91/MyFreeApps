import type { MergeFieldSide } from "./MergeFieldSide";

export interface MergeFieldOverrides {
  transaction_date?: MergeFieldSide;
  vendor?: MergeFieldSide;
  description?: MergeFieldSide;
  amount?: MergeFieldSide;
  category?: MergeFieldSide;
  property_id?: MergeFieldSide;
  payment_method?: MergeFieldSide;
  channel?: MergeFieldSide;
}
