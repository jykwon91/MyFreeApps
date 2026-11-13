import type { INQUIRY_DETAIL_SHEET } from "../constants/inquiries";

export type InquiryDetailSheet = (typeof INQUIRY_DETAIL_SHEET)[keyof typeof INQUIRY_DETAIL_SHEET];
