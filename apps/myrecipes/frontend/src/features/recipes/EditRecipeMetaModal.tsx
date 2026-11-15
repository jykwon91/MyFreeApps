import * as Dialog from "@radix-ui/react-dialog";
import { showError, showSuccess } from "@platform/ui";
import { RECIPE_MANAGE_MESSAGES as MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import { useUpdateRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import { buildRecipeUpdateRequest } from "@myrecipes/api-client/utils/buildRecipeUpdateRequest";
import type { RecipeMetaValues } from "@myrecipes/api-client/types/recipe/recipe-meta-values";
import EditRecipeMetaForm from "@/features/recipes/EditRecipeMetaForm";
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
 * fields. The form lives in a child that mounts with the dialog content, so
 * every open starts from the recipe as it is now (not a stale or abandoned edit).
 */
export default function EditRecipeMetaModal({ open, onClose, recipe }: Props) {
  const [updateRecipe, { isLoading }] = useUpdateRecipeMutation();

  function handleOpenChange(next: boolean) {
    if (!next && !isLoading) onClose();
  }

  async function handleSubmit(values: RecipeMetaValues) {
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

          <EditRecipeMetaForm
            recipe={recipe}
            isLoading={isLoading}
            onSubmit={handleSubmit}
            onCancel={() => handleOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
