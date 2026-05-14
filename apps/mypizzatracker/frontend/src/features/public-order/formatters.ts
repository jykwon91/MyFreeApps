/**
 * Display formatters shared by the customer-facing order pages
 * (PublicOrder.tsx, PublicOrderStatus.tsx, OrderStatusCard).
 *
 * Kept module-local because they are presentation concerns specific to
 * this app's customer flow. The owner-facing screens use the @platform/ui
 * money/time helpers where available.
 */
import { PAYMENT_METHOD_OPTIONS } from "@/types/public/public";

export function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2);
}

export function formatTime(time: string): string {
  // Expecting "HH:MM:SS" or "HH:MM"
  const [hh = "00", mm = "00"] = time.split(":");
  const h = Number(hh);
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${mm} ${period}`;
}

export function formatDateLong(iso: string): string {
  // iso = "YYYY-MM-DD" -- build a local-date Date so we don't drift across TZ.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function paymentMethodLabel(tag: string): string {
  return PAYMENT_METHOD_OPTIONS.find((o) => o.tag === tag)?.label ?? tag;
}

export function formatPhoneDisplay(digits: string): string {
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
