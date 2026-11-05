import type { PendingReceipt } from "../types/lease/pending-receipt";

/** Who paid, as the host knows them: the tenant's name, else the name on the payment. */
export function receiptPayerName(receipt: Pick<PendingReceipt, "tenant_name" | "payer_name">): string | null {
  return receipt.tenant_name ?? receipt.payer_name ?? null;
}
