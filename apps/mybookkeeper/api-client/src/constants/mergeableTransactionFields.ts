import type { MergeableField } from "../types/transaction/MergeableField";

export const MERGEABLE_FIELDS: readonly MergeableField[] = [
  "transaction_date",
  "vendor",
  "description",
  "amount",
  "category",
  "property_id",
  "payment_method",
  "channel",
];

export const FIELD_LABELS: Record<MergeableField, string> = {
  transaction_date: "Date",
  vendor: "Vendor",
  description: "Description",
  amount: "Amount",
  category: "Category",
  property_id: "Property",
  payment_method: "Payment Method",
  channel: "Channel",
};
