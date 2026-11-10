import { INTERVIEW_TYPE_LABELS } from "@myjobhunter/api-client/constants/interviewTypeLabels";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_EVENT_MESSAGES as MESSAGES } from "../../constants/applicationEvents";
import { formatDateTime } from "../../lib/formatDateTime";
import type { InterviewDetailsSummaryProps } from "../../types/InterviewDetailsSummaryProps";
import InterviewLocation from "./InterviewLocation";
import SummaryRow from "./SummaryRow";

/** Type, when, how long, where and with whom, leaving out whatever isn't known yet. */
export default function InterviewDetailsSummary({ details }: InterviewDetailsSummaryProps) {
  const { colors, spacing, fontSize } = useTheme();
  const text = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const names = details.interviewer_names ?? [];
  const minutes = details.duration_minutes;
  return (
    <View style={{ gap: spacing.xs }} testID="interview-details-summary">
      <SummaryRow label={MESSAGES.summaryType}>
        <Text style={text}>{INTERVIEW_TYPE_LABELS[details.type]}</Text>
      </SummaryRow>
      {details.scheduled_at ? (
        <SummaryRow label={MESSAGES.summaryScheduled}>
          <Text style={text}>{formatDateTime(details.scheduled_at)}</Text>
        </SummaryRow>
      ) : null}
      {typeof minutes === "number" && minutes > 0 ? (
        <SummaryRow label={MESSAGES.summaryDuration}>
          <Text style={text}>{`${minutes} ${MESSAGES.minutes}`}</Text>
        </SummaryRow>
      ) : null}
      {details.location_or_link ? (
        <SummaryRow label={MESSAGES.summaryWhere}>
          <InterviewLocation value={details.location_or_link} />
        </SummaryRow>
      ) : null}
      {names.length > 0 ? (
        <SummaryRow label={MESSAGES.summaryWith}>
          <Text style={text}>{names.join(", ")}</Text>
        </SummaryRow>
      ) : null}
    </View>
  );
}
