import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";
import { formatIngredientLine } from "@myrecipes/api-client/utils/formatIngredientLine";
import { useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { COOK_TARGET_HEIGHT } from "../../constants/cook";
import { byPosition } from "../../utils/byPosition";

export default function CookIngredientList({
  checked,
  ingredients,
  onToggle,
}: {
  checked: string[];
  ingredients: IngredientResponse[];
  onToggle: (ingredientId: string) => void;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View>
      {byPosition(ingredients).map((ingredient) => {
        const isChecked = checked.includes(ingredient.id);
        return (
          <Pressable
            accessibilityLabel={formatIngredientLine(ingredient)}
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
            <View
              style={{
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderRadius: radius.sm,
                borderColor: isChecked ? colors.foreground : colors.mutedForeground,
              }}
            >
              {isChecked ? <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "700" }}>✓</Text> : null}
            </View>
            <Text
              style={{
                flex: 1,
                color: isChecked ? colors.mutedForeground : colors.foreground,
                fontSize: fontSize.lg,
                textDecorationLine: isChecked ? "line-through" : "none",
              }}
            >
              {formatIngredientLine(ingredient)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
