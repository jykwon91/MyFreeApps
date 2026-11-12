const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 12345.6 → "12,346". */
export function formatWhole(value: number): string {
  return whole.format(value);
}
