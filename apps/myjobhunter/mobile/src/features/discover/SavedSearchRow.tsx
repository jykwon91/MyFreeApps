import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import {
  useDeactivateDiscoverySourceMutation,
  useRefreshDiscoverySourceMutation,
  useUpdateDiscoverySourceMutation,
} from "@myjobhunter/api-client/store/discoverApi";
import { describeRefreshError } from "@myjobhunter/api-client/utils/describeRefreshError";
import { describeRefreshResult } from "@myjobhunter/api-client/utils/describeRefreshResult";
import { discoverFailureMessage } from "@myjobhunter/api-client/utils/discoverFailureMessage";
import { discoverySourceLabel } from "@myjobhunter/api-client/utils/discoverySourceLabel";
import { discoverySourceTone } from "@myjobhunter/api-client/utils/discoverySourceTone";
import { refreshIntervalShortLabel } from "@myjobhunter/api-client/utils/refreshIntervalShortLabel";
import { savedSearchCadence } from "@myjobhunter/api-client/utils/savedSearchCadence";
import { savedSearchName } from "@myjobhunter/api-client/utils/savedSearchName";
import { summarizeSearchQuery } from "@myjobhunter/api-client/utils/summarizeSearchQuery";
import { Chip, LoadingButton, OptionSheet, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { REFRESH_FREQUENCY_OPTIONS } from "../../constants/refreshFrequency";
import { SAVED_SEARCH_MESSAGES as MESSAGES } from "../../constants/savedSearches";
import type { SavedSearchRowProps } from "../../types/SavedSearchRowProps";

/** A saved search as the website lists it: its name and query, schedule and last error, with Refresh, Edit and Remove. */
export default function SavedSearchRow({ source, onEdit, onRefreshed }: SavedSearchRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { showToast } = useToast();
  const [refresh, { isLoading: isRefreshing }] = useRefreshDiscoverySourceMutation();
  const [deactivate, { isLoading: isRemoving }] = useDeactivateDiscoverySourceMutation();
  const [updateSource, { isLoading: isUpdatingFrequency }] = useUpdateDiscoverySourceMutation();
  const [isFrequencyOpen, setIsFrequencyOpen] = useState(false);
  const query = summarizeSearchQuery(source.config, source.source);
  const name = savedSearchName(source);
  const hasName = source.name.length > 0;
  const kindChip = <Chip label={discoverySourceLabel(source.source)} tone={discoverySourceTone(source.source)} />;

  async function refreshNow(): Promise<void> {
    try {
      const { message, isError, addedPostings } = describeRefreshResult(await refresh(source.id).unwrap());
      showToast(message, isError ? "error" : "success");
      if (addedPostings) onRefreshed(source.id);
    } catch (error) {
      showToast(describeRefreshError(error), "error");
    }
  }

  async function changeFrequency(minutes: number): Promise<void> {
    if (minutes === source.fetch_interval_minutes) return;
    try {
      await updateSource({ sourceId: source.id, patch: { fetch_interval_minutes: minutes } }).unwrap();
      showToast(ACTIONS.frequencyUpdated);
    } catch (error) {
      showToast(discoverFailureMessage(error, ACTIONS.frequencyFailed), "error");
    }
  }

  async function remove(): Promise<void> {
    try {
      await deactivate(source.id).unwrap();
      showToast(ACTIONS.removed);
    } catch (error) {
      showToast(discoverFailureMessage(error, ACTIONS.removeFailed), "error");
    }
  }

  function confirmRemove(): void {
    Alert.alert(MESSAGES.removeTitle, `"${name}" — ${MESSAGES.removeBody}`, [
      { text: MESSAGES.keep, style: "cancel" },
      { text: MESSAGES.remove, style: "destructive", onPress: () => void remove() },
    ]);
  }

  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`saved-search-${source.id}`}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }}>
        {hasName ? null : kindChip}
        <Text style={{ flexShrink: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }} testID="saved-search-name">
          {hasName ? source.name : query}
        </Text>
        {hasName ? kindChip : null}
        {source.consecutive_failures > 0 ? <Chip label={MESSAGES.fetchFailed} tone="danger" /> : null}
      </View>
      {hasName && query ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{query}</Text> : null}
      <LoadingButton
        accessibilityLabel={MESSAGES.editFrequency(refreshIntervalShortLabel(source.fetch_interval_minutes))}
        isLoading={isUpdatingFrequency}
        loadingText={MESSAGES.savingFrequency}
        onPress={() => setIsFrequencyOpen(true)}
        style={{ alignSelf: "flex-start" }}
        variant="ghost"
      >
        {savedSearchCadence(source)}
      </LoadingButton>
      {source.last_error_message ? <Text style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>{source.last_error_message}</Text> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton
          accessibilityLabel={MESSAGES.actionFor(MESSAGES.refresh, name)}
          disabled={isRemoving}
          isLoading={isRefreshing}
          loadingText={MESSAGES.refreshing}
          onPress={refreshNow}
          style={{ flex: 1 }}
          variant="secondary"
        >
          {MESSAGES.refresh}
        </LoadingButton>
        <LoadingButton accessibilityLabel={MESSAGES.actionFor(MESSAGES.edit, name)} disabled={isRemoving} onPress={() => onEdit(source)} style={{ flex: 1 }} variant="secondary">
          {MESSAGES.edit}
        </LoadingButton>
        <LoadingButton
          accessibilityLabel={MESSAGES.actionFor(MESSAGES.remove, name)}
          isLoading={isRemoving}
          loadingText={MESSAGES.removing}
          onPress={confirmRemove}
          style={{ flex: 1 }}
          variant="ghost"
        >
          {MESSAGES.remove}
        </LoadingButton>
      </View>
      <OptionSheet
        description={MESSAGES.frequencySheetDescription}
        isOpen={isFrequencyOpen}
        onClose={() => setIsFrequencyOpen(false)}
        onSelect={(minutes) => {
          setIsFrequencyOpen(false);
          void changeFrequency(Number(minutes));
        }}
        options={REFRESH_FREQUENCY_OPTIONS}
        title={MESSAGES.frequencySheetTitle}
        value={String(source.fetch_interval_minutes)}
      />
    </View>
  );
}
