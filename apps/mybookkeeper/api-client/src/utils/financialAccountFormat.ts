import { format } from "date-fns";

/** Signed cents in the account's own currency: "$1,234.56", "-$25.00", "€100.00". */
export function formatAccountBalance(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** A date-only ISO string as "Nov 1, 2026". Parsed as local midnight, so it never shifts a day. */
export function formatAccountDate(value: string): string {
  return format(new Date(`${value}T00:00:00`), "MMM d, yyyy");
}
