/** What `useInquiryPropertyId` found: the inquiry's house, and whether it is still being looked up. */
export interface InquiryPropertyLookup {
  propertyId: string | null;
  isResolving: boolean;
}
