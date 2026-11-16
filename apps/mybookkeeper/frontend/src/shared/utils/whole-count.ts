export interface WholeCountErrors {
  required: string;
  notWhole: string;
  tooLow: string;
  tooHigh: string;
}

const WHOLE_NUMBER = /^[+-]?\d+$/;

/**
 * Returns a message when `text` is not a whole number within [min, max],
 * or undefined when it is. Never truncates: "2.5" is an error, not 2.
 */
export function wholeCountError(
  text: string,
  min: number,
  max: number,
  errors: WholeCountErrors,
): string | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return errors.required;
  if (!WHOLE_NUMBER.test(trimmed)) return errors.notWhole;
  const value = Number(trimmed);
  if (value < min) return errors.tooLow;
  if (value > max) return errors.tooHigh;
  return undefined;
}
