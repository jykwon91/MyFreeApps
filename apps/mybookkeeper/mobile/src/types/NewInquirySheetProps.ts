import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";

export interface NewInquirySheetProps {
  onClose: () => void;
  /** Called once the server has the inquiry; the sheet has already closed. */
  onCreated: (inquiry: InquiryResponse) => void;
}
