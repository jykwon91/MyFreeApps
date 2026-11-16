import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { versionBadgeLabel } from "@myrecipes/api-client/utils/versionBadgeLabel";
import { Chip, ListRowTitle, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { lastCookedText } from "../../utils/lastCookedText";
import { recipeCardFacts } from "../../utils/recipeCardFacts";
import { recipeCardLabel } from "../../utils/recipeCardLabel";
import StarRating from "./StarRating";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onPress: () => void;
}

export default function RecipeCard({ recipe, onPress }: RecipeCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { versions, owner } = recipeCardFacts(recipe);

  return (
    <Pressable
      accessibilityHint="Opens recipe"
      accessibilityLabel={recipeCardLabel(recipe)}
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
      <ListRowTitle aside={<Chip label={versionBadgeLabel(recipe.latest_version_number)} tone="info" />} numberOfLines={2} title={recipe.title} />
      {recipe.description ? (
        <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
          {recipe.description}
        </Text>
      ) : null}
      {versions ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{versions}</Text>
      ) : null}
      {recipe.is_owner ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.md }}>
          <StarRating rating={recipe.best_rating} />
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
            {lastCookedText(recipe.last_cooked_at)}
          </Text>
        </View>
      ) : null}
      {owner ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{owner}</Text>
      ) : null}
    </Pressable>
  );
}
