import { RECIPE_MANAGE_MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import { FormSheet, LoadingButton, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { MANAGE_RECIPE_MESSAGES as MESSAGES } from "../../constants/manageRecipe";
import type { EditRecipeSheetProps } from "../../types/EditRecipeSheetProps";
import RecipeMetaFields from "../recipeForm/RecipeMetaFields";
import { useEditRecipeForm } from "./useEditRecipeForm";

/** The website's Edit dialog: a recipe's title, description and source. Ingredients and steps change by a tweak. */
export default function EditRecipeSheet({ recipe, onClose }: EditRecipeSheetProps) {
  const { colors, fontSize } = useTheme();
  const form = useEditRecipeForm(recipe, onClose);

  function close(): void {
    if (!form.isSaving) onClose();
  }

  return (
    <FormSheet failure={form.failure} isOpen onRequestClose={close} title={RECIPE_MANAGE_MESSAGES.editTitle}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{RECIPE_MANAGE_MESSAGES.editIntro}</Text>
      <RecipeMetaFields disabled={form.isSaving} onEdit={form.edit} problems={form.problems} values={form.values} />
      <LoadingButton isLoading={form.isSaving} loadingText={MESSAGES.saving} onPress={form.save}>
        {MESSAGES.save}
      </LoadingButton>
      <LoadingButton disabled={form.isSaving} onPress={close} variant="ghost">
        {MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
