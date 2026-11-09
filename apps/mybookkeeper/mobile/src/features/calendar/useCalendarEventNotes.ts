import { useUpdateBlackoutMutation } from "@mybookkeeper/api-client/store/calendarApi";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { EVENT_MESSAGES } from "../../constants/calendarEventDetail";
import { notesFailure } from "./calendarEventFailures";

export interface CalendarEventNotes {
  draft: string;
  isDirty: boolean;
  isSaving: boolean;
  setDraft: (text: string) => void;
  /** True when saved. A failure is shown as a toast. */
  save: () => Promise<boolean>;
  /** Forgets anything typed and not saved. */
  reset: () => void;
}

/** Lives with the sheet, not the notes box, so closing the sheet can ask about unsaved notes. */
export function useCalendarEventNotes(event: CalendarEvent | null): CalendarEventNotes {
  const { showToast } = useToast();
  const [updateBlackout, { isLoading: isSaving }] = useUpdateBlackoutMutation();
  // What was last saved, until the refreshed booking arrives to say it. Null before any save.
  const [justSaved, setJustSaved] = useState<string | null>(null);
  // Null until something is typed, so a refresh can't overwrite what's being typed.
  const [edit, setEdit] = useState<string | null>(null);
  const saved = justSaved ?? event?.host_notes ?? "";
  const draft = edit ?? saved;
  const isDirty = draft.trim() !== saved.trim();

  async function save(): Promise<boolean> {
    if (!event) return false;
    const text = draft.trim();
    try {
      await updateBlackout({ blackoutId: event.id, body: { host_notes: text || null } }).unwrap();
      setJustSaved(text);
      setEdit(null);
      showToast(EVENT_MESSAGES.notesSaved);
      return true;
    } catch (error) {
      showToast(notesFailure(error), "error");
      return false;
    }
  }

  function reset(): void {
    setEdit(null);
    setJustSaved(null);
  }

  return { draft, isDirty, isSaving, setDraft: setEdit, save, reset };
}
