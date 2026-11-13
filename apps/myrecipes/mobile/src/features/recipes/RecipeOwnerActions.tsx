import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import { MANAGE_RECIPE_MESSAGES as MESSAGES } from "../../constants/manageRecipe";
import type { RecipeOwnerActionsProps } from "../../types/RecipeOwnerActionsProps";
import DeleteRecipeButton from "./DeleteRecipeButton";
import EditRecipeSheet from "./EditRecipeSheet";

/** For the recipe's owner, below the recipe: edit its details, or delete it, as the website's Edit and Delete do. */
export default function RecipeOwnerActions({ recipe }: RecipeOwnerActionsProps) {
  const { spacing } = useTheme();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <LoadingButton accessibilityHint={MESSAGES.editHint} onPress={() => setIsEditing(true)} variant="secondary">
        {MESSAGES.edit}
      </LoadingButton>
      <DeleteRecipeButton recipeId={recipe.id} />
      {isEditing ? <EditRecipeSheet onClose={() => setIsEditing(false)} recipe={recipe} /> : null}
    </View>
  );
}
