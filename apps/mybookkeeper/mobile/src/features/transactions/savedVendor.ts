import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import { NONE_CHOICE } from "../../constants/transactionCreateOptions";
import { SAVED_VENDOR_MESSAGES } from "../../constants/transactionFieldLabels";
import type { TransactionChoice } from "../../types/TransactionChoice";

/** None first, so the link can be taken off, then every saved vendor. */
export function savedVendorChoices(vendors: readonly VendorSummary[]): TransactionChoice[] {
  return [NONE_CHOICE, ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))];
}

/** A linked row must never read as having none, even before the list loads or once the vendor is gone. */
export function savedVendorLabel(vendorId: string | null, vendors: readonly VendorSummary[]): string {
  if (vendorId === null) return NONE_CHOICE.label;
  return vendors.find((vendor) => vendor.id === vendorId)?.name ?? SAVED_VENDOR_MESSAGES.unknown;
}
