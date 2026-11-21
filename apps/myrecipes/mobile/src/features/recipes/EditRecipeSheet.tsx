import { RECIPE_MANAGE_MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import { FormSheet, FormSheetCancelButton, LoadingButton, useFieldChain, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { MANAGE_RECIPE_MESSAGES as MESSAGES } from "../../constants/manageRecipe";
import type { EditRecipeSheetProps } from "../../types/EditRecipeSheetProps";
import type { RecipeDetailField } from "../../types/RecipeDetailField";
import RecipeMetaFields from "../recipeForm/RecipeMetaFields";
import { useEditRecipeForm } from "./useEditRecipeForm";

/** The website's Edit dialog: a recipe's title, description and source. Ingredients and steps change by a tweak. */
export default function EditRecipeSheet({ recipe, onClose }: EditRecipeSheetProps) {
  const { colors, fontSize } = useTheme();
  const form = useEditRecipeForm(recipe, onClose);
  const fields = useFieldChain<RecipeDetailField>(["title", "description", "source"]);

  return (
    <FormSheet failure={form.failure} hasUnsavedChanges={form.isDirty} isBusy={form.isSaving} isOpen onRequestClose={onClose} title={RECIPE_MANAGE_MESSAGES.editTitle}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{RECIPE_MANAGE_MESSAGES.editIntro}</Text>
      <RecipeMetaFields disabled={form.isSaving} fields={fields} onEdit={form.edit} problems={form.problems} values={form.values} />
      <LoadingButton isLoading={form.isSaving} loadingText={MESSAGES.saving} onPress={form.save}>
        {MESSAGES.save}
      </LoadingButton>
      <FormSheetCancelButton>{MESSAGES.cancel}</FormSheetCancelButton>
    </FormSheet>
  );
}
