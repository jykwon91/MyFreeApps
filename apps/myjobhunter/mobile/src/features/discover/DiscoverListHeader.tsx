import { Banner, LoadingButton, PickerField, SegmentedControl, SHOWING_LAST_LOADED_MESSAGE, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DISCOVER_SCREEN_MESSAGES as MESSAGES, DISCOVER_SUBTITLE_LINE_HEIGHT, DISCOVER_VIEW_SEGMENTS } from "../../constants/discoverScreen";
import type { DiscoverListHeaderProps } from "../../types/DiscoverListHeaderProps";
import InboxProfileReminder from "./InboxProfileReminder";
import SavedSearchesSection from "./SavedSearchesSection";

/** Everything the website shows above the postings: its subtitle and New saved search, the saved searches, the filter, the tabs, the profile reminder and the scoring line. */
export default function DiscoverListHeader({
  sources,
  areSourcesLoading,
  isSourcesError,
  onRetrySources,
  view,
  onChangeView,
  sourceLabel,
  onChooseSource,
  onNewSavedSearch,
  onEditSavedSearch,
  onSavedSearchRefreshed,
  coverageLine,
  isStale,
}: DiscoverListHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const hasSources = (sources?.length ?? 0) > 0;
  return (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <Text style={{ fontSize: fontSize.sm, lineHeight: DISCOVER_SUBTITLE_LINE_HEIGHT, color: colors.mutedForeground }}>{MESSAGES.subtitle}</Text>
      <LoadingButton onPress={onNewSavedSearch}>{MESSAGES.newSavedSearch}</LoadingButton>
      <SavedSearchesSection isError={isSourcesError} isLoading={areSourcesLoading} onEdit={onEditSavedSearch} onRefreshed={onSavedSearchRefreshed} onRetry={onRetrySources} sources={sources} />
      {hasSources ? <PickerField label={MESSAGES.sourceFilter} onPress={onChooseSource} valueLabel={sourceLabel} /> : null}
      <SegmentedControl accessibilityLabel={MESSAGES.viewsLabel} onChange={onChangeView} segments={DISCOVER_VIEW_SEGMENTS} value={view} />
      {view === "inbox" && hasSources ? <InboxProfileReminder /> : null}
      {coverageLine ? (
        <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }} testID="inbox-scoring-coverage">
          {coverageLine}
        </Text>
      ) : null}
    </View>
  );
}
