import { useState } from "react";
import { Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import type { SuggestedPlaceholderItem } from "@/shared/types/lease/suggest-placeholders-response";
import { LEASE_PLACEHOLDER_INPUT_TYPE_LABELS } from "@/shared/lib/lease-labels";
import type { LeasePlaceholderInputType } from "@/shared/types/lease/lease-placeholder-input-type";

export interface AISuggestionsPanelProps {
  suggestions: SuggestedPlaceholderItem[];
  truncated: boolean;
  pagesNote: string | null;
  templatePlaceholderKeys: Set<string>;
  onDismiss: () => void;
}

/**
 * Banner shown on the LeaseTemplateDetail page after a fresh upload.
 *
 * Displays the AI-proposed placeholders as a collapsible read-only list so the
 * host can see what the AI found vs what the regex extractor found. The host
 * can dismiss the panel; the actual placeholder spec is edited via the existing
 * PlaceholderSpecEditor below.
 *
 * Placeholders already present in the saved spec are highlighted so the host
 * can quickly spot any that the regex missed.
 */
export default function AISuggestionsPanel({
  suggestions,
  truncated,
  pagesNote,
  templatePlaceholderKeys,
  onDismiss,
}: AISuggestionsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const newSuggestions = suggestions.filter(
    (s) => !templatePlaceholderKeys.has(s.key),
  );
  const confirmedCount = suggestions.length - newSuggestions.length;

  return (
    <div
      className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
      data-testid="ai-suggestions-panel"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
          <p className="text-sm font-medium">
            {suggestions.length === 0
              ? "I had a look but didn't find any placeholders."
              : `Got it, I think I found ${suggestions.length} placeholder${suggestions.length === 1 ? "" : "s"}.`}
            {confirmedCount > 0 && suggestions.length > 0 ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                {confirmedCount} already matched by the bracket detector.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {suggestions.length > 0 ? (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label={collapsed ? "Expand suggestions" : "Collapse suggestions"}
            >
              {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Dismiss AI suggestions"
            data-testid="ai-suggestions-dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {truncated && pagesNote ? (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {pagesNote}
        </p>
      ) : null}

      {!collapsed && suggestions.length > 0 ? (
        <ul className="space-y-1.5" data-testid="ai-suggestions-list">
          {suggestions.map((s) => {
            const isNew = !templatePlaceholderKeys.has(s.key);
            return (
              <li
                key={s.key}
                className={`flex items-start gap-2 rounded px-2 py-1.5 text-sm ${
                  isNew
                    ? "bg-background border border-dashed border-primary/40"
                    : "bg-background/60"
                }`}
                data-testid={`ai-suggestion-${s.key}`}
              >
                <span className="font-mono text-xs shrink-0 text-muted-foreground pt-0.5">
                  {`[${s.key}]`}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {LEASE_PLACEHOLDER_INPUT_TYPE_LABELS[
                        s.input_type as LeasePlaceholderInputType
                      ] ?? s.input_type}
                    </span>
                    {isNew ? (
                      <span className="text-xs text-primary font-medium">
                        not in bracket spec
                      </span>
                    ) : null}
                  </div>
                  {s.description ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.description}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Review the placeholder spec below and edit as needed — changes save
        automatically.
      </p>
    </div>
  );
}
