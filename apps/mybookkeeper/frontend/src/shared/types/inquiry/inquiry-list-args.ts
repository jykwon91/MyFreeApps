import type { InquiryStage } from "./inquiry-stage";

/**
 * Query args for the GET /inquiries hook. ``stage`` is optional — omitted
 * means "all stages" (matches the inbox "All" chip).
 */
export interface InquiryListArgs {
  stage?: InquiryStage;
  limit?: number;
  offset?: number;
}
