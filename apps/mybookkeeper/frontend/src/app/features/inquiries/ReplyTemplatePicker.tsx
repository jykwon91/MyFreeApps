import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import ReplyTemplateCard from "./ReplyTemplateCard";

export interface ReplyTemplatePickerProps {
  templates: readonly ReplyTemplate[];
  selectedTemplateId: string | null;
  onSelect: (template: ReplyTemplate) => void;
  disabled?: boolean;
}

/**
 * Scrollable list of templates as cards. Used in both the mobile bottom
 * sheet (vaul) and the desktop left-rail of the reply panel — the picker
 * itself doesn't care about layout, just renders the cards in order.
 */
export default function ReplyTemplatePicker({
  templates,
  selectedTemplateId,
  onSelect,
  disabled = false,
}: ReplyTemplatePickerProps) {
  return (
    <div className="space-y-2 p-3" data-testid="reply-template-picker">
      {templates.map((template) => (
        <ReplyTemplateCard
          key={template.id}
          template={template}
          selected={template.id === selectedTemplateId}
          onSelect={() => onSelect(template)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
