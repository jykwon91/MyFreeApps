import { INQUIRY_STAGES } from "@mybookkeeper/api-client/constants/inquiryLabels";
import type { InquiryPageArgs } from "@mybookkeeper/api-client/types/inquiry/inquiry-page-args";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import { INQUIRY_VIEWS } from "../../constants/inquiries";
import type { InquiryView } from "../../types/InquiryView";

export function viewFromParam(param: string | undefined): InquiryView {
  return INQUIRY_VIEWS.find((view) => view.value === param)?.value ?? "inbox";
}

export function stageFromParam(param: string | undefined): InquiryStage | null {
  return INQUIRY_STAGES.find((stage) => stage === param) ?? null;
}

export function toPageArgs(view: InquiryView, stage: InquiryStage | null): InquiryPageArgs {
  return {
    ...(stage ? { stage } : {}),
    ...(view === "inbox" ? { inbox_only: true } : {}),
    ...(view === "flagged" || view === "spam" ? { spam_status: view } : {}),
  };
}
