import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { PAYMENT_VENDOR_PATTERNS } from "@/shared/lib/payment-vendor-patterns";

export function isPaymentTransaction(txn: Transaction): boolean {
  if (txn.transaction_type !== "income") return false;
  if (!txn.amount || parseFloat(txn.amount) <= 0) return false;
  const vendor = (txn.vendor ?? "").toLowerCase();
  if (!vendor) return false;
  return PAYMENT_VENDOR_PATTERNS.some((p) => vendor.includes(p));
}
