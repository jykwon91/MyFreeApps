import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import {
  useDismissDiscoveredJobMutation,
  usePromoteDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
} from "@myjobhunter/api-client/store/discoverApi";
import { undoDismissDiscoveredJob } from "@myjobhunter/api-client/store/undoDismissDiscoveredJob";
import type { DiscoverCacheDispatch } from "@myjobhunter/api-client/types/discovery/discover-cache-dispatch";
import type { DismissalReason } from "@myjobhunter/api-client/types/discovery/dismissal-reason";
import { discoveredJobFacts } from "@myjobhunter/api-client/utils/discoveredJobFacts";
import { discoveredJobUrl } from "@myjobhunter/api-client/utils/discoveredJobUrl";
import { discoverFailureMessage } from "@myjobhunter/api-client/utils/discoverFailureMessage";
import { undoDismissFailureMessage } from "@myjobhunter/api-client/utils/undoDismissFailureMessage";
import { Chip, LoadingButton, OptionSheet, useOpenLink, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { Text, View } from "react-native";
import { DISCOVERED_JOB_MESSAGES as MESSAGES, DISMISS_SHEET_OPTIONS, SKIP_DISMISS_REASON } from "../../constants/discoveredJob";
import type { DiscoveredJobCardProps } from "../../types/DiscoveredJobCardProps";
import DismissedJobActions from "./DismissedJobActions";

/**
 * A discovered posting as the website's card shows it, with Open, Apply, Save and Dismiss (with a
 * reason, and Undo); in the Dismissed view, the dismissal and Open and Restore instead.
 */
export default function DiscoveredJobCard({ job, sources, profileUpdatedAt, isScoringInFlight }: DiscoveredJobCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { showToast } = useToast();
  const openLink = useOpenLink();
  const [promote, { isLoading: isPromoting }] = usePromoteDiscoveredJobMutation();
  const [save, { isLoading: isSaving }] = useSaveDiscoveredJobMutation();
  const [dismiss, { isLoading: isDismissing }] = useDismissDiscoveredJobMutation();
  const dispatch = useDispatch<DiscoverCacheDispatch>();
  const [isChoosingReason, setIsChoosingReason] = useState(false);
  const facts = discoveredJobFacts(job, profileUpdatedAt, sources);
  const postingUrl = discoveredJobUrl(job);
  const applicationId = job.promoted_application_id;
  const meta = [facts.remoteLabel, facts.salaryLabel, facts.postedLabel ? MESSAGES.posted(facts.postedLabel) : null].filter(Boolean).join(" · ");
  const labelFor = (action: string) => MESSAGES.actionFor(action, job.title, job.company_name);

  async function apply(): Promise<void> {
    try {
      await promote(job.id).unwrap();
      showToast(ACTIONS.promoted);
    } catch (error) {
      showToast(discoverFailureMessage(error, ACTIONS.promoteFailed), "error");
    }
  }

  async function keep(): Promise<void> {
    try {
      await save(job.id).unwrap();
      showToast(ACTIONS.saved);
    } catch (error) {
      showToast(discoverFailureMessage(error, ACTIONS.saveFailed), "error");
    }
  }

  async function undo(): Promise<void> {
    try {
      await dispatch(undoDismissDiscoveredJob(job.id));
      showToast(ACTIONS.undone);
    } catch (error) {
      showToast(undoDismissFailureMessage(error, ACTIONS.undoFailed), "error");
    }
  }

  async function dismissFor(reason: DismissalReason | undefined): Promise<void> {
    try {
      await dismiss({ jobId: job.id, reason }).unwrap();
      showToast(ACTIONS.dismissed, "success", { label: ACTIONS.undo, accessibilityHint: ACTIONS.undoHint, onPress: () => void undo() });
    } catch (error) {
      showToast(discoverFailureMessage(error, ACTIONS.dismissFailed), "error");
    }
  }

  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`discovered-job-${job.id}`}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {facts.verdictLabel ? <Chip label={facts.verdictLabel} tone={facts.verdictTone} /> : null}
        {facts.isScoreStale ? <Chip label={MESSAGES.reScoring} tone="warning" /> : null}
        {!facts.verdictLabel && facts.isUnscored ? <Chip label={isScoringInFlight ? MESSAGES.scoring : MESSAGES.notScored} tone={isScoringInFlight ? "info" : "neutral"} /> : null}
        {facts.isPromoted ? <Chip label={MESSAGES.applied} tone="success" /> : null}
        {job.source_publisher ? <Chip label={job.source_publisher} /> : null}
        {facts.sourceName ? <Chip label={facts.sourceName} /> : null}
      </View>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }} testID="discovered-job-title">
        {job.title}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{job.location ? `${job.company_name} — ${job.location}` : job.company_name}</Text>
      {meta ? <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{meta}</Text> : null}
      {job.score_reason ? (
        <Text style={{ fontSize: fontSize.xs, fontStyle: "italic", color: colors.mutedForeground, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing.sm }}>
          {job.score_reason}
        </Text>
      ) : null}
      {job.description ? (
        <Text numberOfLines={3} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {job.description}
        </Text>
      ) : null}
      {job.dismissed_at ? (
        // Only the Dismissed view lists dismissed postings: Restore replaces the triage actions.
        <DismissedJobActions job={job} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {applicationId ? (
              <LoadingButton accessibilityHint={MESSAGES.opensApplication} accessibilityLabel={labelFor(MESSAGES.viewApplication)} onPress={() => router.push(`/applications/${applicationId}`)} style={{ flex: 1 }}>
                {MESSAGES.viewApplication}
              </LoadingButton>
            ) : (
              <LoadingButton accessibilityLabel={labelFor(MESSAGES.apply)} disabled={isDismissing} isLoading={isPromoting} loadingText={MESSAGES.applying} onPress={apply} style={{ flex: 1 }}>
                {MESSAGES.apply}
              </LoadingButton>
            )}
            <LoadingButton
              accessibilityLabel={labelFor(facts.isSaved ? MESSAGES.saved : MESSAGES.save)}
              disabled={facts.isSaved || facts.isPromoted || isDismissing}
              isLoading={isSaving}
              loadingText={MESSAGES.saving}
              onPress={keep}
              style={{ flex: 1 }}
              variant="secondary"
            >
              {facts.isSaved ? MESSAGES.saved : MESSAGES.save}
            </LoadingButton>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {postingUrl ? (
              <LoadingButton accessibilityLabel={labelFor(MESSAGES.open)} loadingText={MESSAGES.opening} onPress={() => openLink(postingUrl)} style={{ flex: 1 }} variant="secondary">
                {MESSAGES.open}
              </LoadingButton>
            ) : null}
            <LoadingButton
              accessibilityLabel={labelFor(MESSAGES.dismiss)}
              isLoading={isDismissing}
              loadingText={MESSAGES.dismissing}
              onPress={() => setIsChoosingReason(true)}
              style={{ flex: 1 }}
              variant="ghost"
            >
              {MESSAGES.dismiss}
            </LoadingButton>
          </View>
          <OptionSheet
            isOpen={isChoosingReason}
            onClose={() => setIsChoosingReason(false)}
            onSelect={(choice) => {
              setIsChoosingReason(false);
              void dismissFor(choice === SKIP_DISMISS_REASON ? undefined : choice);
            }}
            options={DISMISS_SHEET_OPTIONS}
            title={MESSAGES.dismissSheetTitle}
            value={null}
          />
        </>
      )}
    </View>
  );
}
