import type { MergeFieldPickerMode } from "@/shared/types/transaction/merge-field-picker-mode";
import type { MergeableField } from "./merge-defaults";

interface UseMergeFieldPickerModeArgs {
  visibleFields: readonly MergeableField[];
}

/**
 * Resolves the picker's render mode from the set of conflicting fields.
 * Single source of truth so the body component is a flat switch instead
 * of a tower of conditionals.
 */
export function useMergeFieldPickerMode({
  visibleFields,
}: UseMergeFieldPickerModeArgs): MergeFieldPickerMode {
  if (visibleFields.length === 0) return "no-conflicts";
  if (visibleFields.length === 1 && visibleFields[0] === "transaction_date") return "date-only";
  return "conflicts";
}
