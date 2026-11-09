/** A money amount typed into a form: a number above zero. */
export function isPositiveAmount(text: string): boolean {
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) && parsed > 0;
}

/** Blank means "no late window", and is sent as an explicit null so clearing a value reaches the server. */
export function graceDaysFromText(text: string): number | null {
  return text === "" ? null : Number(text);
}

export function graceDaysToText(days: number | null | undefined): string {
  return days === null || days === undefined ? "" : String(days);
}

/** Blank, or a whole number of days a year can hold. */
export function isValidGraceDays(text: string): boolean {
  if (text === "") return true;
  const days = Number(text);
  return Number.isInteger(days) && days >= 0 && days <= 365;
}
