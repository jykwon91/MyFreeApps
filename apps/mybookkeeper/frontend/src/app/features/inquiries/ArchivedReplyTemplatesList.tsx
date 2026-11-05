import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import RestoreReplyTemplateButton from "./RestoreReplyTemplateButton";

export interface ArchivedReplyTemplatesListProps {
  templates: readonly ReplyTemplate[];
  canWrite: boolean;
  onRestored: () => void;
}

export default function ArchivedReplyTemplatesList({ templates, canWrite, onRestored }: ArchivedReplyTemplatesListProps) {
  return (
    <ul className="divide-y border rounded-md">
      {templates.map((template) => (
        <li
          key={template.id}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          data-testid={`archived-reply-template-row-${template.id}`}
        >
          <div className="min-w-0 flex-1 sm:pr-3">
            <div className="font-medium text-sm truncate">{template.name}</div>
            <div className="text-xs text-muted-foreground truncate">{template.subject_template}</div>
          </div>
          {canWrite ? <RestoreReplyTemplateButton template={template} onRestored={onRestored} /> : null}
        </li>
      ))}
    </ul>
  );
}
