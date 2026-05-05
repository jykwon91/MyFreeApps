import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";

export interface ReplyTemplateCardProps {
  template: ReplyTemplate;
  selected: boolean;
  onSelect: () => void;
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
}: ReplyTemplateCardProps) {
  const previewLines = template.body_template
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, 2)
    .join(" ");
  const preview = previewLines.length > 120
    ? `${previewLines.slice(0, 120).trim()}...`
    : previewLines;

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`reply-template-card-${template.id}`}
      data-selected={selected ? "true" : "false"}
      className={`w-full text-left px-4 py-3 border rounded-lg min-h-[64px] transition-colors ${
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
