import { FormField, LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { CALENDAR_NOTES_MAX_LENGTH, EVENT_MESSAGES } from "../../constants/calendarEventDetail";
import type { CalendarEventNotes as Notes } from "./useCalendarEventNotes";

interface CalendarEventNotesProps {
  notes: Notes;
  canWrite: boolean;
}

export default function CalendarEventNotes({ notes, canWrite }: CalendarEventNotesProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {EVENT_MESSAGES.notes}
      </Text>
      {canWrite ? (
        <>
          <FormField
            editable={!notes.isSaving}
            inputStyle={{ minHeight: 96, textAlignVertical: "top" }}
            label={EVENT_MESSAGES.notesLabel}
            maxLength={CALENDAR_NOTES_MAX_LENGTH}
            multiline
            onChangeText={notes.setDraft}
            value={notes.draft}
          />
          <LoadingButton
            disabled={!notes.isDirty}
            isLoading={notes.isSaving}
            loadingText={EVENT_MESSAGES.savingNotes}
            onPress={() => void notes.save()}
            variant="secondary"
          >
            {EVENT_MESSAGES.saveNotes}
          </LoadingButton>
        </>
      ) : (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {notes.draft || EVENT_MESSAGES.noNotes}
        </Text>
      )}
    </View>
  );
}
