import type { ExpenseRead } from "@/types/financials/financials";

export interface ExpenseRowProps {
  dropId: string;
  expense: ExpenseRead;
  readOnly: boolean;
}
