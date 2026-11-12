import { formatIngredientLine } from "@myrecipes/api-client/utils/formatIngredientLine";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { RecipeIngredientLine } from "../../types/RecipeIngredientLine";
import { byPosition } from "../../utils/byPosition";
import RecipeSectionHeading from "./RecipeSectionHeading";

export default function RecipeIngredients({
  ingredients,
  emptyText = "No ingredients.",
}: {
  ingredients: RecipeIngredientLine[];
  emptyText?: string;
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <RecipeSectionHeading>Ingredients</RecipeSectionHeading>
      {ingredients.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontStyle: "italic" }}>
          {emptyText}
        </Text>
      ) : (
        <View>
          {byPosition(ingredients).map((ingredient) => (
            <View
              key={ingredient.id}
              style={{
                paddingVertical: spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>
                {formatIngredientLine(ingredient)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
