import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { continuesInto, eventHeadline, eventPlace, eventSpokenLabel, stayDates, stayLength } from "./calendarDisplay";

interface CalendarEventRowProps {
  event: CalendarEvent;
  month: string;
  onPress: () => void;
}

export default function CalendarEventRow({ event, month, onPress }: CalendarEventRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const secondaryText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const continues = continuesInto(event, month);

  return (
    <Pressable
      accessibilityHint="Opens details"
      accessibilityLabel={eventSpokenLabel(event, month)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={1} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {eventHeadline(event)}
      </Text>
      <Text numberOfLines={1} style={secondaryText}>
        {eventPlace(event)}
      </Text>
      <Text style={secondaryText}>
        {[`${stayDates(event)} · ${stayLength(event)}`, continues].filter(Boolean).join(", ")}
      </Text>
    </Pressable>
  );
}
