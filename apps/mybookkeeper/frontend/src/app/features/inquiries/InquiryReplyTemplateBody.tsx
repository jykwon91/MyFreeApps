import type { Ref } from "react";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "@/shared/lib/reply-template-messages";
import type { ReplyTemplatesLoad } from "@/shared/types/inquiry/reply-templates-load";
import type { ReplyTemplateRenderState } from "@/shared/types/inquiry/reply-template-render-state";
import RenderedReplyEditor from "./RenderedReplyEditor";
import RenderedReplyEditorSkeleton from "./RenderedReplyEditorSkeleton";
import ReplyTemplatePicker from "./ReplyTemplatePicker";
import ReplyTemplatePickerEmpty from "./ReplyTemplatePickerEmpty";
import ReplyTemplatePickerSkeleton from "./ReplyTemplatePickerSkeleton";
import ReplyTemplatesRetry from "./ReplyTemplatesRetry";

export interface InquiryReplyTemplateBodyProps {
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

export default function InquiryReplyTemplateBody({
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
}: InquiryReplyTemplateBodyProps) {
  const { mode, retry, isRetrying } = templatesLoad;
  const onRetryList = () => void retry();

  return (
    <>
      <div>
        <h4 className="text-sm font-medium mb-2">Choose a template</h4>
        {renderPicker()}
      </div>
      {selectedTemplateId ? (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-2">Preview &amp; edit</h4>
          {renderEditor()}
        </div>
      ) : null}
    </>
  );

  function renderPicker() {
    switch (mode) {
      case "loading":
        return <ReplyTemplatePickerSkeleton />;
      case "error":
        return <ReplyTemplatesRetry message={MESSAGES.couldntLoadActive} announce="alert" isRetrying={isRetrying} onRetry={onRetryList} />;
      case "empty":
        return <ReplyTemplatePickerEmpty onNavigate={onBrowseTemplates} />;
      case "stale":
      case "list":
        return (
          <div className="space-y-2">
            {mode === "stale" ? (
              <ReplyTemplatesRetry message={MESSAGES.showingLastLoadedActive} announce="status" isRetrying={isRetrying} onRetry={onRetryList} />
            ) : null}
            <ReplyTemplatePicker templates={templates} selectedTemplateId={selectedTemplateId} onSelect={onSelectTemplate} />
          </div>
        );
    }
  }

  function renderEditor() {
    if (render.failed) {
      return (
        <div className="space-y-2" data-testid="reply-render-error">
          <ReplyTemplatesRetry message={MESSAGES.couldntFillIn} announce="alert" isRetrying={render.isFetching} onRetry={render.onRetry} />
          <p className="text-xs text-muted-foreground">{MESSAGES.couldntFillInHint}</p>
        </div>
      );
    }
    if (render.isFetching) return <RenderedReplyEditorSkeleton />;
    return (
      <RenderedReplyEditor
        subject={subject}
        body={body}
        onSubjectChange={onSubjectChange}
        onBodyChange={onBodyChange}
        disabled={isSending}
        subjectRef={subjectRef}
      />
    );
  }
}
