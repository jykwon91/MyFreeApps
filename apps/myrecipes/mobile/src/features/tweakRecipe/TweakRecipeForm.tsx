import { CHANGE_NOTE_MAX_LENGTH } from "@myrecipes/api-client/constants/recipeForm";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, LoadingButton, useDiscardPrompt, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { MULTILINE_MIN_HEIGHT } from "../../constants/newRecipe";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../constants/tweakRecipe";
import type { TweakRecipeFormProps } from "../../types/TweakRecipeFormProps";
import RecipeFormLayout from "../recipeForm/RecipeFormLayout";
import RecipeRowsEditor from "../recipeForm/RecipeRowsEditor";
import RecipeTimingFields from "../recipeForm/RecipeTimingFields";
import { useTweakRecipeForm } from "./useTweakRecipeForm";

/**
 * The tweak form: the recipe it's a tweak of, what changed, then the version's fields, ingredients
 * and steps, then Save. The recipe's own title, description and source stay as they are.
 */
export default function TweakRecipeForm({ recipe, version }: TweakRecipeFormProps) {
  const { colors, spacing, fontSize } = useTheme();
  const form = useTweakRecipeForm(recipe.id, version);
  const locked = form.isSaving || form.isLeaving;
  useDiscardPrompt(form.isDirty && !form.isLeaving, form.isSaving);

  return (
    <RecipeFormLayout testID="tweak-recipe">
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "700" }}>
          {recipe.title}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
          {MESSAGES.startingFrom(version.version_number)}
        </Text>
      </View>
      <FormField
        autoCapitalize="sentences"
        counter={characterCounter(form.changeNote.trim(), CHANGE_NOTE_MAX_LENGTH)}
        editable={!locked}
        error={form.noteProblem}
        inputStyle={{ minHeight: MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={MESSAGES.changeNoteLabel}
        multiline
        onChangeText={form.setChangeNote}
        placeholder={MESSAGES.changeNotePlaceholder}
        required
        value={form.changeNote}
      />
      <RecipeTimingFields disabled={locked} onEdit={form.edit} problems={form.problems} values={form.values} />
      <RecipeRowsEditor disabled={locked} problems={form.problems} rows={form.rows} values={form.values} />
      <LoadingButton disabled={form.isLeaving} isLoading={form.isSaving} loadingText={MESSAGES.saving} onPress={form.save}>
        {MESSAGES.save}
      </LoadingButton>
    </RecipeFormLayout>
  );
}
