export interface InquiryListingFieldProps {
  /** A listing id, or "" for not yet linked. */
  value: string;
  onChange: (listingId: string) => void;
  disabled: boolean;
}
