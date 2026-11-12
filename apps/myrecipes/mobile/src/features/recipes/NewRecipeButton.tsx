import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";

/** In the Recipes header, as the website's New recipe button heads its list. */
export default function NewRecipeButton() {
  const { colors, spacing, fontSize } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityLabel={MESSAGES.newRecipe}
      accessibilityRole="button"
      onPress={() => router.push("/recipes/new")}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}
    >
      <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: "600" }}>{MESSAGES.newRecipeShort}</Text>
    </Pressable>
  );
}
