import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import { diffSummary } from "@myrecipes/api-client/utils/diffSummary";
import { EmptyState, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { VersionDiffContentProps } from "../../types/VersionDiffContentProps";
import { DIFF_TWEAK_ENTRY_POINT } from "../../constants/versions";
import { diffLines } from "../../utils/diffLines";
import TweakRecipeButton from "../recipes/TweakRecipeButton";
import DiffSection from "./DiffSection";

/** What changed between two versions, worded as the website words it. The owner can tweak from here. */
export default function VersionDiffContent({ diff, recipeId, isOwner }: VersionDiffContentProps) {
  const { colors, spacing, fontSize } = useTheme();
  const summary = diffSummary(diff);
  const lines = diffLines(diff);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
          {summary.title}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{summary.subtitle}</Text>
      </View>
      {summary.isIdentical ? (
        <EmptyState body={VERSION_COPY.identicalBody} heading={VERSION_COPY.identicalHeading} />
      ) : (
        <>
          <DiffSection emptyText={VERSION_COPY.noIngredientChanges} lines={lines.ingredients} title={VERSION_COPY.ingredients} />
          <DiffSection emptyText={VERSION_COPY.noStepChanges} lines={lines.steps} title={VERSION_COPY.steps} />
        </>
      )}
      {isOwner ? <TweakRecipeButton from={DIFF_TWEAK_ENTRY_POINT} recipeId={recipeId} /> : null}
    </View>
  );
}
