/**
 * Pipeline stages an inquiry can transition through.
 *
 * Mirrors backend ``INQUIRY_STAGES``. Order matches the funnel:
 * new → triaged → replied → screening_requested → video_call_scheduled →
 * approved → converted, with declined / archived as terminal off-funnel
 * states.
 */
export type InquiryStage =
  | "new"
  | "triaged"
  | "replied"
  | "screening_requested"
  | "video_call_scheduled"
  | "approved"
  | "declined"
  | "converted"
  | "archived";
