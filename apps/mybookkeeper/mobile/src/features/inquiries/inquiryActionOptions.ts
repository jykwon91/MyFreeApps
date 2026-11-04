import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";
import { MOVABLE_STAGES } from "../../constants/inquiries";
import type { InquiryMoreAction } from "../../types/InquiryMoreAction";
import { stageLabel } from "./inquiryDisplay";

/** A stage you can't move to from here, like Declined, still shows while it's the current one. */
export function stageOptions(inquiry: InquiryResponse): { value: string; label: string }[] {
  const stages = MOVABLE_STAGES.includes(inquiry.stage) ? MOVABLE_STAGES : [inquiry.stage, ...MOVABLE_STAGES];
  return stages.map((stage) => ({ value: stage, label: stageLabel(stage) }));
}

export function moreOptions(inquiry: InquiryResponse): { value: InquiryMoreAction; label: string }[] {
  const looksLikeSpam = inquiry.spam_status === "flagged" || inquiry.spam_status === "spam";
  return [
    looksLikeSpam ? { value: "notSpam", label: "Not spam" } : { value: "spam", label: "Mark as spam" },
    ...(inquiry.stage === "declined" ? [] : [{ value: "decline" as const, label: "Decline" }]),
    { value: "archive", label: "Archive" },
  ];
}
