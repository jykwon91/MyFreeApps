import { IMPROVEMENT_SEVERITY_LABELS } from "@myjobhunter/api-client/constants/improvementSeverityLabels";
import { IMPROVEMENT_SEVERITY_TONES } from "@myjobhunter/api-client/constants/improvementSeverityTones";
import { IMPROVEMENT_TYPE_LABELS } from "@myjobhunter/api-client/constants/improvementTypeLabels";
import { SuggestionMode } from "@myjobhunter/api-client/types/resume-refinement/suggestion-mode";
import { activeRefinementTarget } from "@myjobhunter/api-client/utils/activeRefinementTarget";
import { plainDraftText } from "@myjobhunter/api-client/utils/plainDraftText";
import { Chip, LoadingButton, useAnnouncement, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeSuggestionCardProps } from "../../types/ResumeSuggestionCardProps";
import ResumeCard from "./ResumeCard";
import ResumeComposer from "./ResumeComposer";
import ResumeCustomSheet from "./ResumeCustomSheet";
import ResumeNavButtons from "./ResumeNavButtons";
import ResumeProgressBar from "./ResumeProgressBar";
import ResumeSuggestionBody from "./ResumeSuggestionBody";

/** The website's suggestion card: where the session is, the line, the rewrite, and every way to answer it. */
export default function ResumeSuggestionCard({ session, proposal, customFailure }: ResumeSuggestionCardProps) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const total = session.improvement_targets?.length ?? 0;
  const target = activeRefinementTarget(session);
  const question = session.pending_clarifying_question;
  // Focus never moves when a suggestion lands, so a screen reader hears it instead.
  useAnnouncement(question ?? session.pending_proposal ?? undefined);

  // Every target is through, or there were none: the finishing card says so.
  if (session.target_index >= total) return null;
  const isUserTarget = target?.origin === "user";

  return (
    <ResumeCard testID="resume-suggestion">
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
          {MESSAGES.suggestionOf(session.target_index + 1, total)}
        </Text>
        {target ? (
          <Chip label={isUserTarget ? MESSAGES.yourPick : IMPROVEMENT_SEVERITY_LABELS[target.severity]} tone={isUserTarget ? "accent" : IMPROVEMENT_SEVERITY_TONES[target.severity]} />
        ) : null}
        {/* A picked line's placeholder type says nothing next to "Your pick". */}
        {target && !isUserTarget ? <Chip label={IMPROVEMENT_TYPE_LABELS[target.improvement_type]} tone="info" /> : null}
      </View>
      <ResumeProgressBar accessibilityLabel={MESSAGES.suggestionProgress(session.target_index, total)} completed={session.target_index} total={total} />
      {target ? (
        <View style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.muted }}>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, fontWeight: "600" }}>{`${MESSAGES.currently} · ${target.section}`}</Text>
          <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{plainDraftText(target.current_text)}</Text>
        </View>
      ) : null}
      <ResumeSuggestionBody
        canForce={session.guard_can_force}
        clarifyingQuestion={question}
        isForcing={proposal.isForcing}
        isPending={proposal.isPending}
        isRegenerating={proposal.isRegenerating}
        onForce={proposal.forceAccept}
        proposal={session.pending_proposal}
        rationale={session.pending_rationale}
      />
      <View style={{ gap: spacing.sm }}>
        <LoadingButton
          disabled={!session.pending_proposal || (proposal.isPending && !proposal.isAccepting)}
          isLoading={proposal.isAccepting}
          loadingText={MESSAGES.accepting}
          onPress={proposal.accept}
        >
          {MESSAGES.accept}
        </LoadingButton>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <LoadingButton disabled={proposal.isPending} onPress={proposal.openCustom} style={{ flex: 1 }} variant="secondary">
            {MESSAGES.writeMyOwn}
          </LoadingButton>
          <LoadingButton disabled={proposal.isPending && !proposal.isSkipping} isLoading={proposal.isSkipping} onPress={proposal.skip} style={{ flex: 1 }} variant="secondary">
            {MESSAGES.skip}
          </LoadingButton>
        </View>
      </View>
      <ResumeComposer
        isBusy={proposal.isPending}
        isClarify={!!question}
        onChange={proposal.setComposerText}
        onRegenerate={proposal.regenerate}
        onSend={proposal.send}
        value={proposal.composerText}
      />
      <ResumeNavButtons isPending={proposal.isPending} sessionId={session.id} targetIndex={session.target_index} totalTargets={total} />
      <ResumeCustomSheet
        failure={customFailure}
        isOpen={proposal.mode === SuggestionMode.CUSTOM}
        isSubmitting={proposal.isSubmittingCustom}
        onChange={proposal.setCustomText}
        onClose={proposal.closeCustom}
        onSubmit={proposal.submitCustom}
        value={proposal.customText}
      />
    </ResumeCard>
  );
}
