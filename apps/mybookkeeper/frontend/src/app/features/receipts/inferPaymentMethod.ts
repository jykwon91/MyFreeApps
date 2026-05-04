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

  if (
    vendor.includes("zelle") ||
    vendor.includes("ach") ||
    vendor.includes("bank transfer") ||
    vendor.includes("wire") ||
    vendor.includes("direct deposit")
  ) {
    return "bank_transfer";
  }
  if (
    vendor.includes("venmo") ||
    vendor.includes("cash app") ||
    vendor.includes("cashapp") ||
    vendor.includes("paypal") ||
    vendor.includes("apple pay") ||
    vendor.includes("google pay")
  ) {
    return "platform_payout";
  }
  if (vendor.includes("airbnb") || vendor.includes("vrbo") || vendor.includes("booking.com")) {
    return "platform_payout";
  }
  if (vendor.includes("check")) return "check";
  if (vendor.includes("cash")) return "cash";

  return "";
}
