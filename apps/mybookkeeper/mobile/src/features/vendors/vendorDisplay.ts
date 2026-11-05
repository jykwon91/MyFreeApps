import { VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import { formatRate } from "@mybookkeeper/api-client/utils/formatRate";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import { contactLinks } from "../inquiries/inquiryContactLinks";

export function categoryFilterLabel(category: VendorCategory | null): string {
  return `Category: ${category ? VENDOR_CATEGORY_LABELS[category] : VENDOR_MESSAGES.allCategories}`;
}

export function noVendorsInCategory(category: VendorCategory): string {
  return `You don't have any vendors under ${VENDOR_CATEGORY_LABELS[category]}.`;
}

export function vendorRowLabel(vendor: VendorSummary): string {
  return [vendor.name, VENDOR_CATEGORY_LABELS[vendor.category], vendor.preferred ? VENDOR_MESSAGES.preferred : null]
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
