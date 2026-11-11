import { Banner, Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { SAVED_SEARCH_MESSAGES as MESSAGES, SAVED_SEARCH_SKELETON_ROWS, SAVED_SEARCHES_HEADING_LINE_HEIGHT } from "../../constants/savedSearches";
import type { SavedSearchesSectionProps } from "../../types/SavedSearchesSectionProps";
import SavedSearchRow from "./SavedSearchRow";
import SavedSearchSkeletonRow from "./SavedSearchSkeletonRow";

/** The website's saved-searches panel: a row each, a skeleton while they load, and a retry if they can't. Nothing when there are none. */
export default function SavedSearchesSection({ sources, isLoading, isError, onRetry, onEdit, onRefreshed }: SavedSearchesSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (isLoading) {
    return (
      <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar" style={{ gap: spacing.sm }} testID="saved-searches-skeleton">
        <Skeleton height={SAVED_SEARCHES_HEADING_LINE_HEIGHT} width="35%" />
        {SAVED_SEARCH_SKELETON_ROWS.map((row) => (
          <SavedSearchSkeletonRow key={row} />
        ))}
      </View>
    );
  }
  if (isError) {
    return <Banner actions={[{ label: MESSAGES.tryAgain, onPress: () => void onRetry() }]} message={MESSAGES.couldntLoad} />;
  }
  if (!sources || sources.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, lineHeight: SAVED_SEARCHES_HEADING_LINE_HEIGHT, fontWeight: "600", color: colors.mutedForeground }}>
        {MESSAGES.heading}
      </Text>
      {sources.map((source) => (
        <SavedSearchRow key={source.id} onEdit={onEdit} onRefreshed={onRefreshed} source={source} />
      ))}
    </View>
  );
}
