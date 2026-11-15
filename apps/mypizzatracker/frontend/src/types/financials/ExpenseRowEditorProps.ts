import type { ExpenseRead } from "@/types/financials/financials";

export interface ExpenseRowEditorProps {
  dropId: string;
  expense: ExpenseRead;
  onClose: () => void;
}
