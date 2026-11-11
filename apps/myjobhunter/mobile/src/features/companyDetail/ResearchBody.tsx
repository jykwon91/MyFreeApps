import { researchSentimentLabel, researchSentimentTone } from "@myjobhunter/api-client/utils/researchSentiment";
import { Chip, LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../../constants/companyResearch";
import { formatShortDate } from "@myjobhunter/api-client/utils/formatShortDate";
import type { ResearchBodyProps } from "../../types/ResearchBodyProps";
import ResearchFailed from "./ResearchFailed";
import ResearchReady from "./ResearchReady";
import ResearchSkeleton from "./ResearchSkeleton";

/**
 * The research panel's four states. The run button stays under the same words while a run is in
 * flight, showing it's working from the moment it's pressed; a run takes up to half a minute.
 */
export default function ResearchBody({ mode, research, companyName, isRunning, failure, onRun }: ResearchBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const bodyText = { fontSize: fontSize.md, color: colors.mutedForeground };

  if (mode === "ready" && research) {
    return (
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }}>
          <Chip label={researchSentimentLabel(research)} tone={researchSentimentTone(research)} />
          {research.last_researched_at ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.lastRun(formatShortDate(research.last_researched_at))}</Text>
          ) : null}
        </View>
        <LoadingButton isLoading={isRunning} loadingText={MESSAGES.running} onPress={onRun} variant="secondary">
          {MESSAGES.rerun}
        </LoadingButton>
        <ResearchReady research={research} />
      </View>
    );
  }

  if (mode === "loading") {
    return (
      <View style={{ gap: spacing.md }}>
        <Text accessibilityLiveRegion="polite" style={bodyText}>
          {MESSAGES.runningNote(companyName)}
        </Text>
        <LoadingButton isLoading loadingText={MESSAGES.running} onPress={onRun}>
          {MESSAGES.run}
        </LoadingButton>
        <ResearchSkeleton />
      </View>
    );
  }

  if (mode === "failed") return <ResearchFailed failure={failure} isRunning={isRunning} onRun={onRun} />;

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={bodyText}>{MESSAGES.noneBody}</Text>
      <LoadingButton isLoading={isRunning} loadingText={MESSAGES.running} onPress={onRun}>
        {MESSAGES.run}
      </LoadingButton>
    </View>
  );
}
