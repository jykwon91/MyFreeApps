import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { replyTemplatePreview } from "@mybookkeeper/api-client/utils/replyTemplatePreview";

export interface ReplyTemplateCardProps {
  template: ReplyTemplate;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Tap-target card for a reply template (mobile bottom sheet + desktop list).
 * Shows the template name and the first two lines of body so the host can
 * quickly distinguish "Initial reply" from "Polite decline" without opening
 * each one. Per the project rule, touch target is at least 44x44px.
 */
export default function ReplyTemplateCard({
  template,
  selected,
  onSelect,
  disabled = false,
}: ReplyTemplateCardProps) {
  const preview = replyTemplatePreview(template.body_template);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      data-testid={`reply-template-card-${template.id}`}
      data-selected={selected ? "true" : "false"}
      className={`w-full text-left px-4 py-3 border rounded-lg min-h-[64px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
        selected
          ? "border-primary bg-primary/5"
          : "border-input hover:bg-muted/50"
      }`}
    >
      <div className="font-medium text-sm">{template.name}</div>
      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
        {preview}
      </div>
    </button>
  );
}
