import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoadingButton, Button, FormField, showError, showSuccess } from "@platform/ui";
import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import { RECIPE_MANAGE_MESSAGES as MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import { useUpdateRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import { buildRecipeUpdateRequest } from "@myrecipes/api-client/utils/buildRecipeUpdateRequest";
import { recipeMetaProblems } from "@myrecipes/api-client/utils/recipeMetaProblems";

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
    const values = { title, description, source };
    const problems = recipeMetaProblems(values);
    const problem = problems.title ?? problems.description ?? problems.source;
    if (problem) {
      showError(problem);
      return;
    }
    try {
      await updateRecipe({ recipeId: recipe.id, body: buildRecipeUpdateRequest(values) }).unwrap();
      showSuccess(MESSAGES.updated);
      onClose();
    } catch {
      showError(MESSAGES.couldntUpdate);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            {MESSAGES.editTitle}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            {MESSAGES.editIntro}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <FormField label="Title" required>
              {(field) => (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isLoading}
                  required
                  maxLength={RECIPE_TITLE_MAX_LENGTH}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]"
                  {...field}
                />
              )}
            </FormField>

            <FormField label="Description">
              {(field) => (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading}
                  rows={3}
                  maxLength={RECIPE_DESCRIPTION_MAX_LENGTH}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  {...field}
                />
              )}
            </FormField>

            <FormField label="Source">
              {(field) => (
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={isLoading}
                  maxLength={RECIPE_SOURCE_MAX_LENGTH}
                  placeholder="e.g. grandma, a cookbook, a URL"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]"
                  {...field}
                />
              )}
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
