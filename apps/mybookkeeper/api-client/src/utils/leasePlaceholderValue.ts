import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { LEASE_NUMBER_PATTERNS } from "../constants/leaseNumber";

/**
 * Whether a number placeholder holds something a person would read as a number. Blank is the
 * caller's to judge. The "." form is always read, since pulled values come that way, and so is
 * the form written with the keypad's own `decimalSeparator` ("1.500,50" on a decimal-comma phone).
 */
export function isReadableLeaseNumber(value: string, decimalSeparator: DecimalSeparator): boolean {
  const trimmed = value.trim();
  return LEASE_NUMBER_PATTERNS["."].test(trimmed) || LEASE_NUMBER_PATTERNS[decimalSeparator].test(trimmed);
}

/** A value saved on a lease can be any JSON, and a missing one reads as a dash. */
export function leaseValueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
