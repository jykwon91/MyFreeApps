import {
  DROP_DELETE_REMOVED_WITHOUT_EXPENSES,
  DROP_DELETE_REMOVED_WITH_UNKNOWN_EXPENSES,
  DROP_DELETE_UNDO_WARNING,
} from "@/constants/dropDelete";

function removedSentence(expenseCount: number | undefined): string {
  if (expenseCount === undefined) return DROP_DELETE_REMOVED_WITH_UNKNOWN_EXPENSES;
  if (expenseCount === 0) return DROP_DELETE_REMOVED_WITHOUT_EXPENSES;
  const noun = expenseCount === 1 ? "expense" : "expenses";
  return `The drop, its slots and its ${expenseCount} ${noun} will be removed.`;
}

/** The delete confirm's body; `expenseCount` is undefined when the drop's expenses couldn't be read. */
export function dropDeleteMessage(expenseCount: number | undefined): string {
  return `${removedSentence(expenseCount)} ${DROP_DELETE_UNDO_WARNING}`;
}
