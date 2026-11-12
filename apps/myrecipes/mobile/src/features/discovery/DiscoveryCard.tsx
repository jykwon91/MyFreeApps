import { DISCOVERY_DIFFICULTY_LABELS, DISCOVERY_SOURCE_LABELS } from "@myrecipes/api-client/constants/discovery";
import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import { formatTotalMinutes } from "@myrecipes/api-client/utils/formatTotalMinutes";
import { hostLabel } from "@myrecipes/api-client/utils/hostLabel";
import { useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { DISCOVERY_CARD_IMAGE_ASPECT } from "../../constants/discovery";
import DiscoverySourceLine from "./DiscoverySourceLine";
import DiscoveryThumbnail from "./DiscoveryThumbnail";

/**
 * One candidate: picture, title, where it came from, and the line that says how this version
 * differs. The whole card is one target, and opening it reads the page, which takes a while.
 */
export default function DiscoveryCard({ recipe, onPress }: { recipe: DiscoveredRecipe; onPress: () => void }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const time = formatTotalMinutes(recipe.total_minutes);
  const difficulty = recipe.difficulty ? DISCOVERY_DIFFICULTY_LABELS[recipe.difficulty] : null;
  const publisher = recipe.site_name ?? hostLabel(recipe.url);
  const label = [recipe.title, DISCOVERY_SOURCE_LABELS[recipe.source_type], publisher, time, difficulty]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      accessibilityHint="Reads this recipe in full, which takes a little while"
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        overflow: "hidden",
        borderWidth: 1,
        borderRadius: radius.md,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.card,
      })}
    >
      <DiscoveryThumbnail aspectRatio={DISCOVERY_CARD_IMAGE_ASPECT} path={recipe.image_url} />
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
          {recipe.title}
        </Text>
        <DiscoverySourceLine publisher={publisher} sourceType={recipe.source_type} />
        {recipe.summary ? (
          <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
            {recipe.summary}
          </Text>
        ) : null}
        {recipe.why_notable ? (
          <Text numberOfLines={2} style={{ color: colors.primary, fontSize: fontSize.sm }}>
            {recipe.why_notable}
          </Text>
        ) : null}
        {time || difficulty ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md }}>
            {time ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{time}</Text> : null}
            {difficulty ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{difficulty}</Text> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
