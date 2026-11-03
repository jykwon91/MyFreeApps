import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { countLabel } from "../../utils/countLabel";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onPress: () => void;
}

export default function RecipeCard({ recipe, onPress }: RecipeCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const versions = recipe.version_count > 0 ? countLabel(recipe.version_count, "version") : null;
  const owner = recipe.owner_display_name ? `by ${recipe.owner_display_name}` : null;
  const label = [recipe.title, versions, owner].filter(Boolean).join(", ");

  return (
    <Pressable
      accessibilityHint="Opens recipe"
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        padding: spacing.lg,
        gap: spacing.xs,
        borderWidth: 1,
        borderRadius: radius.md,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.card,
      })}
    >
      <Text
        numberOfLines={2}
        style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}
      >
        {recipe.title}
      </Text>
      {recipe.description ? (
        <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
          {recipe.description}
        </Text>
      ) : null}
      {versions || owner ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md }}>
          {versions ? (
            <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{versions}</Text>
          ) : null}
          {owner ? (
            <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{owner}</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
