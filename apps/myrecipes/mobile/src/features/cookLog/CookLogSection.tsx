import { COOK_LOG_MESSAGES as SHARED } from "@myrecipes/api-client/constants/cookLog";
import { useListRecipeCooksQuery } from "@myrecipes/api-client/store/recipesApi";
import { cooksNewestFirst } from "@myrecipes/api-client/utils/cooksNewestFirst";
import { LoadingButton, SectionError, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { COOK_LOG_PHONE_MESSAGES as MESSAGES } from "../../constants/cookLog";
import type { CookLogSectionProps } from "../../types/CookLogSectionProps";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";
import CookLogRow from "./CookLogRow";
import CookLogSkeleton from "./CookLogSkeleton";
import LogCookSheet from "./LogCookSheet";
import { useVersionNumberById } from "./useVersionNumberById";

/**
 * The owner's cook log, as on the website's recipe page: "I made it" to log a cook of the version on
 * screen, then every cook across versions, newest first.
 */
export default function CookLogSection({ recipeId, versionId, versionNumber, versionCount }: CookLogSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isLogging, setIsLogging] = useState(false);
  // Reopening asks again, so cooks logged or deleted on the website show.
  const { data: cooks, isError, refetch } = useListRecipeCooksQuery(recipeId, { refetchOnMountOrArgChange: true });
  const versionNumberById = useVersionNumberById(recipeId, versionCount);

  function renderCooks() {
    if (cooks === undefined && isError) {
      return <SectionError message={MESSAGES.loadFailed} onRetry={() => void refetch()} retryLabel={MESSAGES.tryAgain} />;
    }
    if (cooks === undefined) return <CookLogSkeleton />;
    if (cooks.length === 0) {
      return <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontStyle: "italic" }}>{SHARED.empty}</Text>;
    }
    return (
      <View style={{ gap: spacing.md }}>
        {cooksNewestFirst(cooks).map((cook) => (
          <CookLogRow cook={cook} key={cook.id} recipeId={recipeId} versionNumber={versionNumberById[cook.version_id]} />
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <RecipeSectionHeading>{SHARED.historyTitle}</RecipeSectionHeading>
      <LoadingButton accessibilityHint={MESSAGES.madeItHint} onPress={() => setIsLogging(true)} variant="secondary">
        {SHARED.madeIt}
      </LoadingButton>
      {renderCooks()}
      {isLogging ? (
        <LogCookSheet
          onClose={() => setIsLogging(false)}
          recipeId={recipeId}
          versionId={versionId}
          versionNumber={versionNumber}
        />
      ) : null}
    </View>
  );
}
