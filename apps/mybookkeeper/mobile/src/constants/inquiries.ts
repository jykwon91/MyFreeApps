import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import type { InquiryView } from "../types/InquiryView";

export const INQUIRY_VIEWS: readonly { value: InquiryView; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "flagged", label: "Flagged" },
  { value: "spam", label: "Spam" },
  { value: "all", label: "All" },
];

/** The stages you can move an inquiry to here. Declined and Archived have their own confirmations; Converted comes from promoting. */
export const MOVABLE_STAGES: readonly InquiryStage[] = [
  "new",
  "triaged",
  "replied",
  "screening_requested",
  "video_call_scheduled",
  "approved",
];

export const ALL_STAGES_OPTION = "all";

/** Past this, the first message opens clamped, with Show more. */
export const CLAMPED_MESSAGE_LINES = 12;
export const LONG_MESSAGE_CHARACTERS = 500;

/** Same as the server's limit on notes. */
export const INQUIRY_NOTES_MAX_LENGTH = 5000;

export const INQUIRY_EMPTY_WORDS: Record<InquiryView, { heading: string; body: string }> = {
  inbox: { heading: "No inquiries yet", body: "When someone asks about a room, it'll show up here." },
  flagged: { heading: "Nothing flagged", body: "I haven't spotted anything that looks like spam." },
  spam: { heading: "No spam", body: "Anything I'm sure is spam goes here." },
  all: { heading: "No inquiries yet", body: "When someone asks about a room, it'll show up here." },
};

export const MAX_NEW_INQUIRY_BADGE = 99;

export const INQUIRY_REPLY_VIEW_ONLY_BODY = "Ask the workspace owner if you need to reply.";
