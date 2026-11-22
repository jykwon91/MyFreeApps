import { FIELD_ERROR_NAME_PREFIX } from "../constants/formField";

/**
 * A control's spoken name: the visible label, plus ", required" when the field must be filled in,
 * plus ", error: <message>" when it has a problem. The error lives in the name (always read) rather
 * than the hint (skipped when hints are off), which stays free for the field's own format hint.
 */
export const requiredFieldLabel = (label: string, required: boolean, error?: string): string => {
  const name = required ? `${label}, required` : label;
  return error ? `${name}, ${FIELD_ERROR_NAME_PREFIX}${error}` : name;
};
