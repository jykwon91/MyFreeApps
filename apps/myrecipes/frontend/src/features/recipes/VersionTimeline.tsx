import { GitCompare } from "lucide-react";
import { Button, formatDate } from "@platform/ui";
import StarRating from "@/features/recipes/StarRating";
import type { VersionSummary } from "@/types/recipe/version";

interface Props {
  versions: VersionSummary[];
  /** The version currently being viewed in the body. */
  selectedId: string | null;
  /** Up to two ids picked for comparison. */
  compareIds: string[];
  onSelect: (versionId: string) => void;
  onToggleCompare: (versionId: string) => void;
  onCompare: () => void;
}

/**
 * The version timeline rail (newest first). Each entry shows the version
 * number, its change note, when it was created, and its best rating. Clicking
 * an entry views that version's body; the compare checkboxes pick up to two
 * versions to diff. The "Compare" button is enabled once exactly two are
 * selected.
 *
 * This rail is the spine of the product — it's how the user reads the history
 * of a recipe and jumps into a diff between any two points.
 */
export default function VersionTimeline({
  versions,
  selectedId,
  compareIds,
  onSelect,
  onToggleCompare,
  onCompare,
}: Props) {
  // Newest first for the rail; the API returns oldest-first.
  const ordered = [...versions].sort((a, b) => b.version_number - a.version_number);

  return (
    <div className="bg-card border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">Timeline</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={onCompare}
          disabled={compareIds.length !== 2}
          title={
            compareIds.length === 2
              ? "Compare the two selected versions"
              : "Select two versions to compare"
          }
        >
          <span className="inline-flex items-center gap-1.5">
            <GitCompare className="w-4 h-4" />
            Compare
          </span>
        </Button>
      </div>

      <ol className="space-y-2">
        {ordered.map((version, idx) => {
          const isSelected = version.id === selectedId;
          const isChecked = compareIds.includes(version.id);
          const checkboxDisabled = !isChecked && compareIds.length >= 2;
          return (
            <li key={version.id} className="relative">
              <div
                className={`rounded-md border p-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={checkboxDisabled}
                    onChange={() => onToggleCompare(version.id)}
                    aria-label={`Select v${version.version_number} to compare`}
                    className="mt-1 h-4 w-4 shrink-0 rounded border accent-primary cursor-pointer disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => onSelect(version.id)}
                    className="flex-1 text-left"
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">
                        v{version.version_number}
                        {idx === 0 ? (
                          <span className="ml-2 text-xs font-normal text-primary">
                            latest
                          </span>
                        ) : null}
                      </span>
                      <StarRating value={version.best_rating} size={14} showEmptyDash />
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {version.change_note ?? (
                        <span className="italic text-muted-foreground/60">
                          {version.version_number === 1
                            ? "Original recipe"
                            : "No change note"}
                        </span>
                      )}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(version.created_at)}</span>
                      <span>
                        {version.cook_count} cook
                        {version.cook_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
