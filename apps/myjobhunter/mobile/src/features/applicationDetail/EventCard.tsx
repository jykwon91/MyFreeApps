import { INTERVIEW_EVENT_TYPES } from "@myjobhunter/api-client/constants/interviewEventTypes";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import { Chip, LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_EVENT_MESSAGES as MESSAGES } from "../../constants/applicationEvents";
import { formatDateTime } from "../../lib/formatDateTime";
import type { EventCardProps } from "../../types/EventCardProps";
import InterviewDetailsSummary from "./InterviewDetailsSummary";

/** One entry on the timeline: what happened and when, interview details, the note, and where it came from. */
export default function EventCard({ event, onEdit }: EventCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const isInterview = INTERVIEW_EVENT_TYPES.has(event.event_type);
  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`event-${event.id}`}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <Chip label={formatEventType(event.event_type)} />
        <Text style={{ flexShrink: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatDateTime(event.occurred_at)}</Text>
      </View>
      {event.interview_details ? <InterviewDetailsSummary details={event.interview_details} /> : null}
      {event.note ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {event.note}
        </Text>
      ) : null}
      {event.source === "manual" ? null : <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{`${MESSAGES.via} ${event.source}`}</Text>}
      {isInterview ? (
        <LoadingButton
          accessibilityLabel={`${MESSAGES.edit}: ${formatEventType(event.event_type)}, ${formatDateTime(event.occurred_at)}`}
          onPress={() => onEdit(event)}
          variant="secondary"
        >
          {MESSAGES.edit}
        </LoadingButton>
      ) : null}
    </View>
  );
}
