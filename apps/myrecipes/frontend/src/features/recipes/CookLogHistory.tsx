import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog, formatDate, showError, showSuccess } from "@platform/ui";
import StarRating from "@/features/recipes/StarRating";
import { useDeleteCookMutation } from "@/store/recipesApi";
import type { CookLogResponse } from "@/types/recipe/cook-log";

interface Props {
  recipeId: string;
  cooks: CookLogResponse[];
  /** Maps a version id to its display number for the "v3" label per entry. */
  versionNumberById: Record<string, number>;
}

/**
 * The cook-log history across all versions of a recipe, newest first. Each row
 * shows the date, which version was cooked, the star rating, and any notes,
 * with a delete affordance guarded by a confirm dialog.
 */
export default function CookLogHistory({
  recipeId,
  cooks,
  versionNumberById,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteCook, { isLoading: isDeleting }] = useDeleteCookMutation();

  const ordered = [...cooks].sort(
    (a, b) => new Date(b.cooked_at).getTime() - new Date(a.cooked_at).getTime(),
  );

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteCook({ recipeId, cookId: pendingDelete }).unwrap();
      showSuccess("Cook log deleted.");
      setPendingDelete(null);
    } catch {
      showError("Couldn't delete that cook log — please try again.");
    }
  }

  if (ordered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No cooks logged yet. Hit "I made it" after you cook this to start
        tracking how each version turns out.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {ordered.map((cook) => {
          const versionNumber = versionNumberById[cook.version_id];
          return (
            <li
              key={cook.id}
              className="flex items-start justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{formatDate(cook.cooked_at)}</span>
                  {versionNumber !== undefined ? (
                    <span className="text-xs text-muted-foreground">
                      v{versionNumber}
                    </span>
                  ) : null}
                  <StarRating value={cook.rating} size={14} showEmptyDash />
                </div>
                {cook.outcome_notes ? (
                  <p className="text-sm text-muted-foreground">
                    {cook.outcome_notes}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(cook.id)}
                aria-label="Delete cook log"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete cook log?"
        description="This removes this cook record. It won't change any recipe version."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
