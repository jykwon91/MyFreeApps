import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";
import { useTheme } from "@platform/mobile";
import { ScrollView } from "react-native";
import CookIngredientList from "./CookIngredientList";
import CookSheet from "./CookSheet";

export default function CookIngredientsSheet({
  checked,
  ingredients,
  onClose,
  onToggle,
}: {
  checked: string[];
  ingredients: IngredientResponse[];
  onClose: () => void;
  onToggle: (ingredientId: string) => void;
}) {
  const { spacing } = useTheme();

  return (
    <CookSheet onClose={onClose} testID="cook-ingredients-sheet" title="Ingredients">
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
        <CookIngredientList checked={checked} ingredients={ingredients} onToggle={onToggle} />
      </ScrollView>
    </CookSheet>
  );
}
