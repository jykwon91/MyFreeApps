import { trimDecimal } from "./holdingForm";

const QUANTITY_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });

/** A share count as "1,234.5678": every decimal the bank sent, no trailing zeros. */
export function formatQuantity(value: string | null): string {
  if (value === null) return "—";
  const [whole, fraction] = trimDecimal(value).split(".");
  const grouped = QUANTITY_FORMAT.format(Number(whole));
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** A per-share price in the holding's currency, keeping sub-cent digits a fund price may have. */
export function formatPrice(value: string | null, currency: string): string {
  if (value === null) return "—";
  const decimals = Math.min(Math.max(trimDecimal(value).split(".")[1]?.length ?? 0, 2), 8);
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: decimals,
  }).format(Number(value));
}

/** A gain or loss percent as "+12.3%" / "-4.0%"; a dash when it can't be worked out. */
export function formatGainLossPercent(percent: number | null): string {
  if (percent === null) return "—";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

/** Whether a gain/loss reads as up, down or flat; null when unknown. */
export function gainLossDirection(cents: number | null): "gain" | "loss" | "flat" | null {
  if (cents === null) return null;
  if (cents > 0) return "gain";
  if (cents < 0) return "loss";
  return "flat";
}
