import { useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";

export default function RecipeDetailScreen() {
  const { colors, spacing, fontSize } = useTheme();
  // A deep link has only the id; the list passes the rest so this opens with no request.
  const { title, owner } = useLocalSearchParams<{ title?: string; owner?: string }>();

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      style={{ backgroundColor: colors.background }}
    >
      <Stack.Screen options={{ title: "Recipe", headerBackTitle: "Recipes" }} />
      <Text
        accessibilityRole="header"
        style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}
      >
        {title || "Recipe"}
      </Text>
      {owner ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>by {owner}</Text>
      ) : null}
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        The full recipe isn't available in the app yet.
      </Text>
    </ScrollView>
  );
}
