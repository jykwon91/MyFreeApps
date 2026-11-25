import { useGetInquiryByIdQuery } from "../store/inquiriesApi";
import { useGetListingByIdQuery } from "../store/listingsApi";
import type { InquiryPropertyLookup } from "../types/lease/inquiry-property-lookup";

/**
 * The house an applicant's inquiry came in for: inquiry → its listing → that listing's property.
 * A new lease starts on this house, as the server would default it. `propertyId` is null when there is
 * no inquiry, the inquiry has no listing, or either can't be loaded — the host then picks the house.
 */
export function useInquiryPropertyId(inquiryId: string | null | undefined): InquiryPropertyLookup {
  const inquiry = useGetInquiryByIdQuery(inquiryId ?? "", { skip: !inquiryId });
  const listingId = inquiry.currentData?.listing_id ?? null;
  const listing = useGetListingByIdQuery(listingId ?? "", { skip: !listingId });

  const isResolving = Boolean(inquiryId) && (inquiry.isFetching || (Boolean(listingId) && listing.isFetching));
  return { propertyId: listing.currentData?.property_id ?? null, isResolving };
}
