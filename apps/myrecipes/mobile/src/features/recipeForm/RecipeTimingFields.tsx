import { RECIPE_SERVINGS_MAX_LENGTH } from "@myrecipes/api-client/constants/recipeForm";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { RecipeTimingFieldsProps } from "../../types/RecipeTimingFieldsProps";

/** Servings, then prep and cook minutes side by side, as on the website. */
export default function RecipeTimingFields({ values, problems, disabled, onEdit }: RecipeTimingFieldsProps) {
  const { spacing } = useTheme();

  return (
    <>
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
