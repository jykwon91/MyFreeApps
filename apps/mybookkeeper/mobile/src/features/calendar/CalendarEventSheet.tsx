import { isReadOnlySource } from "@mybookkeeper/api-client/constants/calendarSources";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { LoadingButton, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { useEffect, useRef } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { CALENDAR_MESSAGES } from "../../constants/calendar";
import { EVENT_MESSAGES } from "../../constants/calendarEventDetail";
import { useCanWrite } from "../workspace/useCanWrite";
import { eventHeadline } from "./calendarDisplay";
import CalendarEventAttachments from "./CalendarEventAttachments";
import CalendarEventFacts from "./CalendarEventFacts";
import CalendarEventNotes from "./CalendarEventNotes";
import { useCalendarEventNotes } from "./useCalendarEventNotes";

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
  const canWrite = useCanWrite();
  const notes = useCalendarEventNotes(event);
  const wasOpen = useRef(isOpen);

  // Only iOS tells a Modal it has finished closing. Android has nothing to wait for.
  useEffect(() => {
    if (Platform.OS !== "ios" && wasOpen.current && !isOpen) onClosed();
    wasOpen.current = isOpen;
  }, [isOpen, onClosed]);

  if (!event) return null;
  const isLease = isReadOnlySource(event.source);

  function leave(): void {
    notes.reset();
    onClose();
  }

  function close(): void {
    if (notes.isSaving) return;
    if (!canWrite || !notes.isDirty) {
      leave();
      return;
    }
    Alert.alert(EVENT_MESSAGES.saveNotesTitle, EVENT_MESSAGES.saveNotesBody, [
      { text: EVENT_MESSAGES.keepEditing, style: "cancel" },
      { text: EVENT_MESSAGES.discard, style: "destructive", onPress: leave },
      {
        text: EVENT_MESSAGES.save,
        onPress: async () => {
          if (await notes.save()) leave();
        },
      },
    ]);
  }

  return (
    <Modal animationType="slide" onDismiss={Platform.OS === "ios" ? onClosed : undefined} onRequestClose={close} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {eventHeadline(event)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={close}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{CALENDAR_MESSAGES.close}</Text>
          </Pressable>
        </View>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
          <CalendarEventFacts event={event} />
          {isLease ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{EVENT_MESSAGES.leaseNote}</Text>
              <LoadingButton onPress={() => onOpenLease(event.id)} variant="secondary">
                {CALENDAR_MESSAGES.openLease}
              </LoadingButton>
            </View>
          ) : (
            <>
              <CalendarEventNotes canWrite={canWrite} notes={notes} />
              <CalendarEventAttachments blackoutId={event.id} canWrite={canWrite} />
              {canWrite ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{EVENT_MESSAGES.notAllowed}</Text>}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
