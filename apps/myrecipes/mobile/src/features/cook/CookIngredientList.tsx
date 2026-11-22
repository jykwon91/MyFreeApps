import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";
import { formatIngredientLine } from "@myrecipes/api-client/utils/formatIngredientLine";
import { deviceDecimalSeparator, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { COOK_CHECKBOX_SIZE, COOK_TARGET_HEIGHT } from "../../constants/cook";
import { byPosition } from "../../utils/byPosition";
import CheckboxBox from "../checkbox/CheckboxBox";

export default function CookIngredientList({
  checked,
  ingredients,
  onToggle,
}: {
  checked: string[];
  ingredients: IngredientResponse[];
  onToggle: (ingredientId: string) => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const decimalSeparator = deviceDecimalSeparator();

  return (
    <View>
      {byPosition(ingredients).map((ingredient) => {
        const isChecked = checked.includes(ingredient.id);
        return (
          <Pressable
            accessibilityLabel={formatIngredientLine(ingredient, decimalSeparator)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            key={ingredient.id}
            onPress={() => onToggle(ingredient.id)}
            style={{
              minHeight: COOK_TARGET_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <CheckboxBox isChecked={isChecked} size={COOK_CHECKBOX_SIZE} variant="outline" />
            <Text
              style={{
                flex: 1,
                color: isChecked ? colors.mutedForeground : colors.foreground,
                fontSize: fontSize.lg,
                textDecorationLine: isChecked ? "line-through" : "none",
              }}
            >
              {formatIngredientLine(ingredient, decimalSeparator)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
