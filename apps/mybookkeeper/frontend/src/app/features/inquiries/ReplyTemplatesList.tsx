import { Pencil, Archive } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";

export interface ReplyTemplatesListProps {
  templates: readonly ReplyTemplate[];
  onEdit: (template: ReplyTemplate) => void;
  onArchive: (template: ReplyTemplate) => void;
}

export default function ReplyTemplatesList({
  templates,
  onEdit,
  onArchive,
}: ReplyTemplatesListProps) {
  return (
    <ul className="divide-y border rounded-md">
      {templates.map((template) => (
        <li
          key={template.id}
          className="flex items-center justify-between p-3"
          data-testid={`reply-template-row-${template.id}`}
        >
          <div className="min-w-0 flex-1 pr-3">
            <div className="font-medium text-sm truncate">{template.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {template.subject_template}
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onEdit(template)}
              data-testid={`reply-template-edit-${template.id}`}
              aria-label={`Edit ${template.name}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onArchive(template)}
              data-testid={`reply-template-archive-${template.id}`}
              aria-label={`Archive ${template.name}`}
            >
              <Archive className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
