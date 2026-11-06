import type { Ref } from "react";
import type { InquiryReplyMode } from "@/shared/types/inquiry/inquiry-reply-mode";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import type { ReplyTemplatesLoad } from "@/shared/types/inquiry/reply-templates-load";
import type { ReplyTemplateRenderState } from "@/shared/types/inquiry/reply-template-render-state";
import type { GmailReconnectBannerProps } from "./GmailReconnectBanner";
import InquiryReplyCustomBody from "./InquiryReplyCustomBody";
import InquiryReplyReconnectBody from "./InquiryReplyReconnectBody";
import InquiryReplyTemplateBody from "./InquiryReplyTemplateBody";

export interface InquiryReplyPanelBodyProps {
  mode: InquiryReplyMode;
  reconnectReason: GmailReconnectBannerProps["reason"] | null;
  templates: readonly ReplyTemplate[];
  templatesLoad: ReplyTemplatesLoad;
  selectedTemplateId: string | null;
  render: ReplyTemplateRenderState;
  isSending: boolean;
  subject: string;
  body: string;
  onSelectTemplate: (template: ReplyTemplate) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onBrowseTemplates: () => void;
  subjectRef: Ref<HTMLInputElement>;
}

export default function InquiryReplyPanelBody({
  mode,
  reconnectReason,
  templates,
  templatesLoad,
  selectedTemplateId,
  render,
  isSending,
  subject,
  body,
  onSelectTemplate,
  onSubjectChange,
  onBodyChange,
  onBrowseTemplates,
  subjectRef,
}: InquiryReplyPanelBodyProps) {
  switch (mode) {
    case "reconnect":
      // reconnectReason is always non-null when mode === "reconnect"
      return <InquiryReplyReconnectBody reason={reconnectReason!} />;
    case "template":
      return (
        <InquiryReplyTemplateBody
          templates={templates}
          templatesLoad={templatesLoad}
          selectedTemplateId={selectedTemplateId}
          render={render}
          isSending={isSending}
          subject={subject}
          body={body}
          onSelectTemplate={onSelectTemplate}
          onSubjectChange={onSubjectChange}
          onBodyChange={onBodyChange}
          onBrowseTemplates={onBrowseTemplates}
          subjectRef={subjectRef}
        />
      );
    case "custom":
      return (
        <InquiryReplyCustomBody
          subject={subject}
          body={body}
          isSending={isSending}
          onSubjectChange={onSubjectChange}
          onBodyChange={onBodyChange}
        />
      );
  }
}
