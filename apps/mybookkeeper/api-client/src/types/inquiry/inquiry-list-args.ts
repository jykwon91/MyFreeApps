import type { InquirySpamStatus } from "./inquiry-spam-status";
import type { InquiryStage } from "./inquiry-stage";

/**
 * Query args for the GET /inquiries hook. ``stage`` and ``spam_status`` are
 * optional — omitted means "all" (matches the inbox "All" chip / tab).
 */
export interface InquiryListArgs {
  stage?: InquiryStage;
  spam_status?: InquirySpamStatus;
  /** Everything except flagged and spam, which includes email inquiries, never scored. */
  inbox_only?: boolean;
  limit?: number;
  offset?: number;
}
