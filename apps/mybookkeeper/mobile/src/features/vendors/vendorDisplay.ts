import { VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import { formatHourlyRate } from "@mybookkeeper/api-client/utils/formatHourlyRate";
import { formatVendorLastUsed } from "@mybookkeeper/api-client/utils/formatVendorLastUsed";
import { formatRate } from "@mybookkeeper/api-client/utils/formatRate";
import { VENDOR_FILTER_MESSAGES, VENDOR_MESSAGES } from "../../constants/vendors";
import { contactLinks } from "../inquiries/inquiryContactLinks";

/** "Filters" when nothing is narrowed, otherwise what is, so the button says what the list is showing. */
export function vendorFilterLabel(category: VendorCategory | null, preferredOnly: boolean): string {
  const active = [category ? VENDOR_CATEGORY_LABELS[category] : null, preferredOnly ? VENDOR_MESSAGES.preferred : null].filter(Boolean);
  return active.length > 0 ? `${VENDOR_FILTER_MESSAGES.button}: ${active.join(", ")}` : VENDOR_FILTER_MESSAGES.button;
}

/** The rate and when the vendor was last used, as the website's rows say them. */
export function vendorRowFacts(vendor: VendorSummary): string {
  return `${formatHourlyRate(vendor.hourly_rate)} · ${formatVendorLastUsed(vendor.last_used_at)}`;
}

export function vendorRowLabel(vendor: VendorSummary): string {
  return [vendor.name, VENDOR_CATEGORY_LABELS[vendor.category], vendor.preferred ? VENDOR_MESSAGES.preferred : null, vendorRowFacts(vendor)]
    .filter(Boolean)
    .join(", ");
}

/** Null when the number has nothing to dial, so the row doesn't offer a call that can't work. */
export function callLink(vendor: VendorSummary): { spoken: string; url: string } | null {
  return contactLinks(vendor.name, null, vendor.phone).find((link) => link.url.startsWith("tel:")) ?? null;
}

export function hourlyRateText(rate: string): string {
  return `${formatRate(rate)} an hour`;
}

export function directionsUrl(address: string, os: string): string {
  const query = encodeURIComponent(address);
  return os === "ios" ? `https://maps.apple.com/?q=${query}` : `geo:0,0?q=${query}`;
}

/** Null when the vendor has never been used, which the screen says in its own words. */
export function lastUsedText(lastUsedAt: string | null): string | null {
  return lastUsedAt ? `${VENDOR_MESSAGES.lastUsed} ${formatVendorLastUsed(lastUsedAt)}` : null;
}
