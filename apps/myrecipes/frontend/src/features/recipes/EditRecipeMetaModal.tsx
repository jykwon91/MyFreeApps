import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoadingButton, Button, FormField, showError, showSuccess } from "@platform/ui";
import { useUpdateRecipeMutation } from "@/store/recipesApi";
import type { RecipeDetailResponse } from "@/types/recipe/recipe";

interface Props {
  open: boolean;
  onClose: () => void;
  recipe: RecipeDetailResponse;
}

/**
 * Edits recipe-level metadata (title / description / source). Ingredients and
 * steps are intentionally NOT editable here — changing those is a tweak (a new
 * version), per the backend contract where PATCH only accepts these three
 * fields.
 */
export default function EditRecipeMetaModal({ open, onClose, recipe }: Props) {
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description ?? "");
  const [source, setSource] = useState(recipe.source ?? "");
  const [updateRecipe, { isLoading }] = useUpdateRecipeMutation();

  function handleOpenChange(next: boolean) {
    if (!next && !isLoading) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      showError("Title can't be empty.");
      return;
    }
    try {
      await updateRecipe({
        recipeId: recipe.id,
        body: {
          title: title.trim(),
          description: description.trim() || null,
          source: source.trim() || null,
        },
      }).unwrap();
      showSuccess("Recipe updated.");
      onClose();
    } catch {
      showError("Couldn't save those changes — please try again.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            Edit recipe details
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Change the title, description, or source. To change ingredients or
            steps, make a tweak instead.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <FormField label="Title" required>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
                required
                maxLength={255}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]"
              />
            </FormField>

            <FormField label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                rows={3}
                maxLength={5000}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </FormField>

            <FormField label="Source">
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={isLoading}
                maxLength={1000}
                placeholder="e.g. grandma, a cookbook, a URL"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]"
              />
            </FormField>

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
                disabled={!title.trim()}
              >
                Save changes
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
