import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoadingButton, Button, showError, showSuccess } from "@platform/ui";
import StarRatingInput from "@/features/recipes/StarRatingInput";
import { useLogCookMutation } from "@/store/recipesApi";

interface Props {
  open: boolean;
  onClose: () => void;
  recipeId: string;
  /** The version being logged — its number is shown for context. */
  versionId: string;
  versionNumber: number;
}

/**
 * "I made it" modal — logs a cook for a specific version: a 1-5 star rating
 * plus optional outcome notes. On success the recipes/version/cook caches are
 * invalidated by the mutation so the detail page reflects the new best rating.
 */
export default function CookLogModal({
  open,
  onClose,
  recipeId,
  versionId,
  versionNumber,
}: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [logCook, { isLoading }] = useLogCookMutation();

  function reset() {
    setRating(null);
    setNotes("");
  }

  function handleOpenChange(next: boolean) {
    if (!next && !isLoading) {
      reset();
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await logCook({
        recipeId,
        versionId,
        body: {
          rating,
          outcome_notes: notes.trim() || null,
        },
      }).unwrap();
      showSuccess("Cook logged.");
      reset();
      onClose();
    } catch {
      showError("Couldn't log that cook — please try again.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            Log a cook
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Recording how v{versionNumber} turned out this time.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <span className="block text-sm font-medium mb-1.5">How was it?</span>
              <StarRatingInput
                value={rating}
                onChange={setRating}
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="cook-notes" className="block text-sm font-medium mb-1">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                id="cook-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isLoading}
                rows={3}
                placeholder="Too salty, needs 5 more minutes, doubled the garlic..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                size="sm"
                isLoading={isLoading}
                loadingText="Saving..."
              >
                Save cook
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
