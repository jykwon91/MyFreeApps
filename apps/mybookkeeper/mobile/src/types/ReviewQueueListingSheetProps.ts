export interface ReviewQueueListingSheetProps {
  isOpen: boolean;
  /** Says which booking the listing is wanted for. */
  description: string;
  onSelect: (listingId: string) => void;
  onClose: () => void;
  onClosed: () => void;
  onAddListing: () => void;
}
