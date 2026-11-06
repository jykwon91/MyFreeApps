import { Panel, PanelCloseButton, PanelTitle } from "@platform/ui";
import { Button } from "@platform/ui";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "@/shared/lib/reply-template-messages";

export interface ReplyTemplateViewProps {
  template: ReplyTemplate;
  onClose: () => void;
}

/** A template read-only, for someone with view-only access. */
export default function ReplyTemplateView({ template, onClose }: ReplyTemplateViewProps) {
  return (
    <Panel position="right" onClose={onClose} width="560px">
      <div className="flex flex-col flex-1 overflow-hidden" data-testid="reply-template-view">
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div className="min-w-0">
            <PanelTitle asChild>
              <h3 className="font-medium text-base break-words">{template.name}</h3>
            </PanelTitle>
            <p className="text-xs text-muted-foreground">{MESSAGES.viewOnlyNote}</p>
          </div>
          <PanelCloseButton onClose={onClose} />
        </div>

        <dl className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground mb-1">{MESSAGES.subjectLabel}</dt>
            <dd className="break-words">{template.subject_template}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">{MESSAGES.bodyLabel}</dt>
            <dd className="whitespace-pre-wrap break-words font-mono">{template.body_template}</dd>
          </div>
        </dl>

        <div className="px-5 py-4 border-t flex items-center justify-end">
          <Button variant="secondary" size="md" onClick={onClose}>
            {MESSAGES.close}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
