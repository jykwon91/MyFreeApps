import type { InquirySource } from "@/shared/types/inquiry/inquiry-source";
import type { ListingSource } from "@/shared/types/listing/listing-source";

/**
 * Union of every external platform a Listing or Inquiry can come from.
 *
 * The two domains overlap (FF / TNH / direct) but each has unique values:
 *   - Listings have ``Airbnb`` (we may publish to Airbnb)
 *   - Inquiries have ``other`` (one-off platforms like Zillow)
 *
 * SourceBadge accepts the union so it can render badges for either domain
 * without duplicating the icon/color tables.
 */
export type Source = ListingSource | InquirySource;
