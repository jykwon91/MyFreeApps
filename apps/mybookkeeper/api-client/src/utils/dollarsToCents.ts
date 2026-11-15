/**
 * Dollars typed by hand → integer cents, or null when the field is blank or not a number.
 *
 * ``Number("")`` is 0, not NaN, so a blank field would otherwise post a real
 * zero — which for a premium means "free", for a deductible "first-dollar
 * coverage" and for a mortgage balance "paid off". All are claims the
 * operator did not make.
 */
export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}
