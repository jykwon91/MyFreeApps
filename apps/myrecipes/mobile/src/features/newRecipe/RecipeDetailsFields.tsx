import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_SERVINGS_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import type { RecipeFormProblems } from "@myrecipes/api-client/types/recipe/recipe-form-problems";
import type { RecipeFormValues } from "@myrecipes/api-client/types/recipe/recipe-form-values";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MULTILINE_MIN_HEIGHT, NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";

type MetaField = Exclude<keyof RecipeFormValues, "ingredients" | "steps">;

interface RecipeDetailsFieldsProps {
  values: RecipeFormValues;
  problems: RecipeFormProblems;
  disabled: boolean;
  /** Puts the cursor in the title, for a filled-in draft that came without one. */
  focusTitle?: boolean;
  onEdit: (field: MetaField, text: string) => void;
}

/** The recipe's own fields: title, description, source, servings and times, as on the website. */
export default function RecipeDetailsFields({ values, problems, disabled, focusTitle, onEdit }: RecipeDetailsFieldsProps) {
  const { spacing } = useTheme();

  return (
    <>
      <FormField
        autoCapitalize="sentences"
        autoFocus={focusTitle}
        editable={!disabled}
        error={problems.title}
        label={MESSAGES.titleLabel}
        counter={characterCounter(values.title.trim(), RECIPE_TITLE_MAX_LENGTH)}
        onChangeText={(text) => onEdit("title", text)}
        required
        value={values.title}
      />
      <FormField
        editable={!disabled}
        inputStyle={{ minHeight: MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        counter={characterCounter(values.description.trim(), RECIPE_DESCRIPTION_MAX_LENGTH)}
        error={problems.description}
        label={MESSAGES.descriptionLabel}
        multiline
        onChangeText={(text) => onEdit("description", text)}
        value={values.description}
      />
      <FormField
        autoCapitalize="none"
        editable={!disabled}
        counter={characterCounter(values.source.trim(), RECIPE_SOURCE_MAX_LENGTH)}
        error={problems.source}
        label={MESSAGES.sourceLabel}
        onChangeText={(text) => onEdit("source", text)}
        placeholder={MESSAGES.sourcePlaceholder}
        value={values.source}
      />
      <FormField
        editable={!disabled}
        counter={characterCounter(values.servings.trim(), RECIPE_SERVINGS_MAX_LENGTH)}
        error={problems.servings}
        label={MESSAGES.servingsLabel}
        onChangeText={(text) => onEdit("servings", text)}
        placeholder={MESSAGES.servingsPlaceholder}
        value={values.servings}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <FormField
          editable={!disabled}
          error={problems.prepMinutes}
          keyboardType="number-pad"
          label={MESSAGES.prepLabel}
          onChangeText={(text) => onEdit("prepMinutes", text)}
          style={{ flex: 1 }}
          value={values.prepMinutes}
        />
        <FormField
          editable={!disabled}
          error={problems.cookMinutes}
          keyboardType="number-pad"
          label={MESSAGES.cookLabel}
          onChangeText={(text) => onEdit("cookMinutes", text)}
          style={{ flex: 1 }}
          value={values.cookMinutes}
        />
      </View>
    </>
  );
}
