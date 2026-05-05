import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";
import RenderedReplyEditor from "./RenderedReplyEditor";
import ReplyTemplatePicker from "./ReplyTemplatePicker";

export interface InquiryReplyTemplateBodyProps {
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

export default function InquiryReplyTemplateBody({
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
}: InquiryReplyTemplateBodyProps) {
  return (
    <>
      <div>
        <h4 className="text-sm font-medium mb-2">Choose a template</h4>
        {templatesLoading ? (
          <div
            className="text-sm text-muted-foreground"
            data-testid="reply-templates-loading"
          >
            Loading templates...
          </div>
        ) : (
          <ReplyTemplatePicker
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelect={onSelectTemplate}
          />
        )}
      </div>
      {selectedTemplateId !== null ? (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-2">Preview &amp; edit</h4>
          {isRenderFetching ? (
            <div
              className="text-sm text-muted-foreground"
              data-testid="reply-render-loading"
            >
              Hmm, let me build that for you...
            </div>
          ) : (
            <RenderedReplyEditor
              subject={subject}
              body={body}
              onSubjectChange={onSubjectChange}
              onBodyChange={onBodyChange}
              disabled={isSending}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
