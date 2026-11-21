/** A control's spoken name: the visible label, plus ", required" when the field must be filled in. */
export const requiredFieldLabel = (label: string, required: boolean): string => (required ? `${label}, required` : label);
