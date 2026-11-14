import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog, formatDate, showError, showSuccess } from "@platform/ui";
import StarRating from "@/features/recipes/StarRating";
import { useDeleteCookMutation } from "@myrecipes/api-client/store/recipesApi";
import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import { COOK_LOG_MESSAGES as MESSAGES } from "@myrecipes/api-client/constants/cookLog";
import { cooksNewestFirst } from "@myrecipes/api-client/utils/cooksNewestFirst";

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

  const ordered = cooksNewestFirst(cooks);

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteCook({ recipeId, cookId: pendingDelete }).unwrap();
      showSuccess(MESSAGES.deleted);
      setPendingDelete(null);
    } catch {
      showError(MESSAGES.couldntDelete);
    }
  }

  if (ordered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">{MESSAGES.empty}</p>
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
                aria-label={MESSAGES.deleteLabel}
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
        title={MESSAGES.deleteTitle}
        description={MESSAGES.deleteBody}
        confirmLabel={MESSAGES.deleteConfirm}
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
