export type MoneySegment = "transactions" | "documents";

export const MONEY_SEGMENTS: readonly { value: MoneySegment; label: string }[] = [
  { value: "transactions", label: "Transactions" },
  { value: "documents", label: "Documents" },
];
