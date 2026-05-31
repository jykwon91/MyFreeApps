import type { Transaction } from "@/shared/types/transaction/transaction";

/**
 * Best-effort inference of a receipt's payment method when the
 * extraction didn't fill ``transaction.payment_method``. Maps known
 * P2P / platform vendors to the value that the receipt PDF would
 * print anyway. Returns ``""`` when no confident default can be made
 * (caller falls back to the manual select).
 */
export function inferPaymentMethod(transaction: Transaction): string {
  if (transaction.payment_method) return transaction.payment_method;

  const vendor = (transaction.vendor ?? "").toLowerCase();
  if (!vendor) return "";

  // Specific P2P rails first — these are the host-visible value on the receipt
  // ("Zelle", not the generic "Bank transfer"). "cash app" must be matched
  // before the generic "cash" fallback below.
  if (vendor.includes("zelle")) return "zelle";
  if (vendor.includes("venmo")) return "venmo";
  if (vendor.includes("cash app") || vendor.includes("cashapp")) return "cash_app";
  if (vendor.includes("paypal")) return "paypal";

  if (
    vendor.includes("ach") ||
    vendor.includes("bank transfer") ||
    vendor.includes("wire") ||
    vendor.includes("direct deposit")
  ) {
    return "bank_transfer";
  }
  if (
    vendor.includes("apple pay") ||
    vendor.includes("google pay") ||
    vendor.includes("airbnb") ||
    vendor.includes("vrbo") ||
    vendor.includes("booking.com")
  ) {
    return "platform_payout";
  }
  if (vendor.includes("check")) return "check";
  if (vendor.includes("cash")) return "cash";

  return "";
}
