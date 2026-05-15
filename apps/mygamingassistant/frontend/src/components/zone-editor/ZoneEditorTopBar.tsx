/**
 * Top bar for the plan-mode zone editor. Owns Back-to-map navigation,
 * dirty indicator, Save, Discard, and the page title.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export interface ZoneEditorTopBarProps {
  gameSlug: string;
  mapSlug: string;
  mapName: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export default function ZoneEditorTopBar({
  gameSlug,
  mapSlug,
  mapName,
  isDirty,
  isSaving,
  onSave,
  onDiscard,
}: ZoneEditorTopBarProps) {
  const backHref = `/${gameSlug}/${mapSlug}`;
  return (
    <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b bg-card">
      <Link
        to={backHref}
        className="p-2 -ml-2 rounded-md hover:bg-muted/40 transition-colors min-h-[40px]"
        aria-label="Back to map"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground capitalize">{gameSlug}</p>
        <h1 className="text-base font-semibold capitalize truncate">
          Edit zones — {mapName}
        </h1>
      </div>
      {isDirty && (
        <span
          className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
          aria-live="polite"
        >
          Unsaved changes
        </span>
      )}
      <button
        type="button"
        onClick={onDiscard}
        disabled={!isDirty || isSaving}
        className="px-3 py-1.5 text-sm rounded-md border bg-card hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
      >
        {isSaving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
