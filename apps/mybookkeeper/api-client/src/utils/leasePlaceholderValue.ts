/** Digits with an optional sign, dollar sign, thousands commas and decimals: 1500, $1,500.50, -12. */
const READABLE_NUMBER = /^-?\$?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/;

/** Whether a number placeholder holds something a person would read as a number. Blank is the caller's to judge. */
export function isReadableLeaseNumber(value: string): boolean {
  return READABLE_NUMBER.test(value.trim());
}

/** A value saved on a lease can be any JSON, and a missing one reads as a dash. */
export function leaseValueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
