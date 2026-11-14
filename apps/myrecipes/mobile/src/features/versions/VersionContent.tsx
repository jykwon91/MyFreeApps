import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import { versionNote } from "@myrecipes/api-client/utils/versionNote";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { VersionContentProps } from "../../types/VersionContentProps";
import { versionMeta } from "../../utils/versionMeta";
import LogCookButton from "../cookLog/LogCookButton";
import RecipeFacts from "../recipes/RecipeFacts";
import RecipeIngredients from "../recipes/RecipeIngredients";
import RecipeSteps from "../recipes/RecipeSteps";
import VersionChangesButton from "./VersionChangesButton";

/**
 * One version in full, as the website shows the version picked in its timeline: its number, note,
 * date and the owner's cooks and best rating, its facts, ingredients and steps. The owner can log a cook of this version, as "I made it" does
 * there; any version but the first can show what changed from the one it was based on.
 */
export default function VersionContent({ version, summary, recipeId, isLatest, isOwner }: VersionContentProps) {
  const { colors, spacing, fontSize } = useTheme();
  const note = versionNote(version);
  // The date, then the owner's cooks and best rating, as the website's timeline shows the picked version.
  const meta = versionMeta(summary ?? { created_at: version.created_at, cook_count: null, best_rating: null });

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
            v{version.version_number}
          </Text>
          {isLatest ? <Text style={{ color: colors.primary, fontSize: fontSize.sm }}>{VERSION_COPY.latest}</Text> : null}
        </View>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: fontSize.sm,
            fontStyle: note.isPlaceholder ? "italic" : "normal",
          }}
        >
          {note.text}
        </Text>
        <Text
          accessibilityLabel={meta.map((part) => part.spoken).join(", ")}
          style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}
          testID="version-meta"
        >
          {meta.map((part) => part.text).join(" · ")}
        </Text>
      </View>
      <RecipeFacts version={version} />
      {version.parent_version_id ? <VersionChangesButton recipeId={recipeId} versionId={version.id} /> : null}
      {isOwner ? (
        <LogCookButton recipeId={recipeId} versionId={version.id} versionNumber={version.version_number} />
      ) : null}
      <RecipeIngredients ingredients={version.ingredients} />
      <RecipeSteps steps={version.steps} />
    </View>
  );
}
