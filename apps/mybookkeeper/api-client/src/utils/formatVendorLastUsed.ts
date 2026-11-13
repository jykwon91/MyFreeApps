import { VENDOR_NEVER_USED } from "../constants/vendorLastUsed";
import { formatRelativeTime } from "./inquiryDateFormat";

/** "3 days ago", or "Never used" when the vendor has no last-used time. */
export function formatVendorLastUsed(lastUsedAt: string | null): string {
  return lastUsedAt ? formatRelativeTime(lastUsedAt) : VENDOR_NEVER_USED;
}
