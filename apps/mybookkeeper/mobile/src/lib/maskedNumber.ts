const VISIBLE_DIGITS = 4;
const SHORTEST_NUMBER_TO_PARTLY_SHOW = 8;
const HIDDEN_DIGITS = "••••";

/** On a short number the last four would be most of it, so then nothing shows. */
export function maskedNumber(value: string): string {
  return value.length >= SHORTEST_NUMBER_TO_PARTLY_SHOW ? `${HIDDEN_DIGITS} ${value.slice(-VISIBLE_DIGITS)}` : HIDDEN_DIGITS;
}
