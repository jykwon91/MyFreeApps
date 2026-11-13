import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import { undoDismissDiscoveredJob } from "@myjobhunter/api-client/store/undoDismissDiscoveredJob";
import type { DiscoverCacheDispatch } from "@myjobhunter/api-client/types/discovery/discover-cache-dispatch";
import { discoveredJobUrl } from "@myjobhunter/api-client/utils/discoveredJobUrl";
import { dismissalSummary } from "@myjobhunter/api-client/utils/dismissalSummary";
import { undoDismissFailureMessage } from "@myjobhunter/api-client/utils/undoDismissFailureMessage";
import { LoadingButton, useOpenLink, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { Text, View } from "react-native";
import { DISCOVERED_JOB_MESSAGES as MESSAGES } from "../../constants/discoveredJob";
import type { DismissedJobActionsProps } from "../../types/DismissedJobActionsProps";

/**
 * A dismissed posting's footer in the Dismissed view, as the website's: when (and why) it was
 * dismissed, Open, and Restore, which sends it back to the inbox. The card goes once the refetched
 * list drops it.
 */
export default function DismissedJobActions({ job }: DismissedJobActionsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const openLink = useOpenLink();
  const dispatch = useDispatch<DiscoverCacheDispatch>();
  const [isRestoring, setIsRestoring] = useState(false);
  const summary = dismissalSummary(job);
  const postingUrl = discoveredJobUrl(job);
  const labelFor = (action: string) => MESSAGES.actionFor(action, job.title, job.company_name);

  async function restore(): Promise<void> {
    setIsRestoring(true);
    try {
      await dispatch(undoDismissDiscoveredJob(job.id));
      showToast(ACTIONS.restored);
      // Stays disabled: the card goes once the refetched list drops it, and a second tap would 404.
    } catch (error) {
      showToast(undoDismissFailureMessage(error, ACTIONS.restoreFailed), "error");
      setIsRestoring(false);
    }
  }

  return (
    <>
      {summary ? (
        <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }} testID="dismissal-summary">
          {summary}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {postingUrl ? (
          <LoadingButton accessibilityLabel={labelFor(MESSAGES.open)} loadingText={MESSAGES.opening} onPress={() => openLink(postingUrl)} style={{ flex: 1 }} variant="secondary">
            {MESSAGES.open}
          </LoadingButton>
        ) : null}
        <LoadingButton
          accessibilityHint={ACTIONS.restoreHint}
          accessibilityLabel={labelFor(MESSAGES.restore)}
          isLoading={isRestoring}
          loadingText={MESSAGES.restoring}
          onPress={restore}
          style={{ flex: 1 }}
        >
          {MESSAGES.restore}
        </LoadingButton>
      </View>
    </>
  );
}
