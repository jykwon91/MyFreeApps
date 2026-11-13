import { RECIPE_MANAGE_MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import { useDeleteRecipeMutation } from "@myrecipes/api-client/store/recipesApi";
import { LoadingButton, useConfirmedRemoval } from "@platform/mobile";
import { router } from "expo-router";
import { MANAGE_RECIPE_MESSAGES as MESSAGES } from "../../constants/manageRecipe";
import { RECIPES_LIST_PATH } from "../../constants/routes";
import type { DeleteRecipeButtonProps } from "../../types/DeleteRecipeButtonProps";

/**
 * The website's Delete, after asking. Once it's gone (or was already) the screen goes back to the
 * recipes list, whose cached copy the delete has marked stale, so it's asked for again.
 */
export default function DeleteRecipeButton({ recipeId }: DeleteRecipeButtonProps) {
  const [deleteRecipe] = useDeleteRecipeMutation();
  const { isRemoving, confirmRemove } = useConfirmedRemoval(
    () => deleteRecipe(recipeId).unwrap(),
    {
      removeTitle: RECIPE_MANAGE_MESSAGES.deleteTitle,
      removeBody: RECIPE_MANAGE_MESSAGES.deleteBody,
      remove: RECIPE_MANAGE_MESSAGES.deleteConfirm,
      keep: MESSAGES.cancel,
      removed: RECIPE_MANAGE_MESSAGES.deleted,
      gone: MESSAGES.gone,
      couldntRemove: RECIPE_MANAGE_MESSAGES.couldntDelete,
    },
    { onRemoved: () => router.dismissTo(RECIPES_LIST_PATH) },
  );

  return (
    <LoadingButton
      accessibilityHint={MESSAGES.deleteHint}
      isLoading={isRemoving}
      loadingText={MESSAGES.deleting}
      onPress={confirmRemove}
      variant="destructive"
    >
      {RECIPE_MANAGE_MESSAGES.deleteConfirm}
    </LoadingButton>
  );
}
