import type { InquiryReplyMode } from "@/shared/types/inquiry/inquiry-reply-mode";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";
import type { GmailReconnectBannerProps } from "./GmailReconnectBanner";
import InquiryReplyCustomBody from "./InquiryReplyCustomBody";
import InquiryReplyReconnectBody from "./InquiryReplyReconnectBody";
import InquiryReplyTemplateBody from "./InquiryReplyTemplateBody";

export interface InquiryReplyPanelBodyProps {
  mode: InquiryReplyMode;
  reconnectReason: GmailReconnectBannerProps["reason"] | null;
  templates: ReplyTemplate[];
  templatesLoading: boolean;
  selectedTemplateId: string | null;
  isRenderFetching: boolean;
  isSending: boolean;
  subject: string;
  body: string;
  onSelectTemplate: (template: ReplyTemplate) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
}

export default function InquiryReplyPanelBody({
  mode,
  reconnectReason,
  templates,
  templatesLoading,
  selectedTemplateId,
  isRenderFetching,
  isSending,
  subject,
  body,
  onSelectTemplate,
  onSubjectChange,
  onBodyChange,
}: InquiryReplyPanelBodyProps) {
  switch (mode) {
    case "reconnect":
      // reconnectReason is always non-null when mode === "reconnect"
      return <InquiryReplyReconnectBody reason={reconnectReason!} />;
    case "template":
      return (
        <InquiryReplyTemplateBody
          templates={templates}
          templatesLoading={templatesLoading}
          selectedTemplateId={selectedTemplateId}
          isRenderFetching={isRenderFetching}
          isSending={isSending}
          subject={subject}
          body={body}
          onSelectTemplate={onSelectTemplate}
          onSubjectChange={onSubjectChange}
          onBodyChange={onBodyChange}
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
