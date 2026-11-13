import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, useTheme } from "@platform/mobile";
import { MULTILINE_MIN_HEIGHT, NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { RecipeMetaFieldsProps } from "../../types/RecipeMetaFieldsProps";

/** A recipe's title, description and source, for creating a recipe and for editing its details. */
export default function RecipeMetaFields({ values, problems, disabled, focusTitle, onEdit }: RecipeMetaFieldsProps) {
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
    </>
  );
}
