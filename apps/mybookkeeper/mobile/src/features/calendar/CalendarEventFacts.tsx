import { getSourceLabel, isReadOnlySource } from "@mybookkeeper/api-client/constants/calendarSources";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { timeSince } from "@platform/core/utils/timeSince";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { EVENT_MESSAGES } from "../../constants/calendarEventDetail";
import { eventPlace, lastChangedLine, stayDates, stayLength } from "./calendarDisplay";

export default function CalendarEventFacts({ event }: { event: CalendarEvent }) {
  const { colors, spacing, fontSize } = useTheme();
  const isLease = isReadOnlySource(event.source);
  const lines = [
    eventPlace(event),
    `${stayDates(event)} · ${stayLength(event)}`,
    `${lastChangedLine(event)} (${timeSince(event.updated_at)})`,
    ...(isLease ? [] : [`${EVENT_MESSAGES.source}: ${getSourceLabel(event.source)}`]),
    ...(!isLease && event.summary ? [`${EVENT_MESSAGES.fromChannel}: ${event.summary}`] : []),
    ...(!isLease && event.source_event_id ? [`${EVENT_MESSAGES.channelId}: ${event.source_event_id}`] : []),
  ];

  return (
    <View style={{ gap: spacing.md }}>
      {lines.map((line) => (
        <Text key={line} selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {line}
        </Text>
      ))}
      {!isLease && !event.summary ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{EVENT_MESSAGES.noGuestDetails}</Text>
      ) : null}
    </View>
  );
}
