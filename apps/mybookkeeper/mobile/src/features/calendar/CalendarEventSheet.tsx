import { isReadOnlySource } from "@mybookkeeper/api-client/constants/calendarSources";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { LoadingButton, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { useEffect, useRef } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { CALENDAR_MESSAGES } from "../../constants/calendar";
import { eventHeadline, eventPlace, lastChangedLine, stayDates, stayLength } from "./calendarDisplay";

interface CalendarEventSheetProps {
  /** Kept after closing, so the sheet doesn't go blank as it slides away. */
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenLease: (leaseId: string) => void;
  onClosed: () => void;
}

export default function CalendarEventSheet({ event, isOpen, onClose, onOpenLease, onClosed }: CalendarEventSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const wasOpen = useRef(isOpen);

  // Only iOS tells a Modal it has finished closing. Android has nothing to wait for.
  useEffect(() => {
    if (Platform.OS !== "ios" && wasOpen.current && !isOpen) onClosed();
    wasOpen.current = isOpen;
  }, [isOpen, onClosed]);

  if (!event) return null;
  const isLease = isReadOnlySource(event.source);
  const details = [
    eventPlace(event),
    `${stayDates(event)} · ${stayLength(event)}`,
    lastChangedLine(event),
  ];

  return (
    <Modal animationType="slide" onDismiss={Platform.OS === "ios" ? onClosed : undefined} onRequestClose={onClose} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {eventHeadline(event)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{CALENDAR_MESSAGES.close}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic">
          {details.map((detail) => (
            <Text key={detail} style={{ fontSize: fontSize.md, color: colors.foreground }}>
              {detail}
            </Text>
          ))}
          {!isLease && event.host_notes ? (
            <View style={{ gap: spacing.xs }}>
              <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
                {CALENDAR_MESSAGES.notes}
              </Text>
              <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{event.host_notes}</Text>
            </View>
          ) : null}
          {isLease ? (
            <LoadingButton onPress={() => onOpenLease(event.id)} variant="secondary">
              {CALENDAR_MESSAGES.openLease}
            </LoadingButton>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
