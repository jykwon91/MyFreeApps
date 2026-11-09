import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { lastSyncedAt, relativeTime } from "@mybookkeeper/api-client/utils/calendarSync";
import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { FILTER_MESSAGES } from "../../constants/calendarFilters";

/** The newest change across this month's bookings. With none, a dash: "just now" over nothing would mislead. */
export default function CalendarLastSynced({ events }: { events: readonly CalendarEvent[] }) {
  const { colors, fontSize } = useTheme();
  const latest = lastSyncedAt(events);
  return (
    <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
      {FILTER_MESSAGES.lastSynced}: {latest ? relativeTime(latest) : "—"}
    </Text>
  );
}
