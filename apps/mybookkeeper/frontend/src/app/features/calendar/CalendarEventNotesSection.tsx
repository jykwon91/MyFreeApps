import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { showError, showSuccess } from "@platform/ui";
import { useUpdateBlackoutMutation } from "@mybookkeeper/api-client/store/calendarApi";
import { CALENDAR_NOTES_MAX_LENGTH } from "@mybookkeeper/api-client/constants/calendarNotes";

// Debounce delay for saving notes while typing (ms).
const NOTES_SAVE_DELAY_MS = 600;
const NOTES_SAVE_FAILED = "I couldn't save the notes. Want to try again?";

export interface CalendarEventNotesSectionProps {
  blackoutId: string;
  initialNotes: string | null;
}

export default function CalendarEventNotesSection({ blackoutId, initialNotes }: CalendarEventNotesSectionProps) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [updateBlackout] = useUpdateBlackoutMutation();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = useRef(notes);
  // The trimmed text the server holds, and the trimmed text last sent (saved or still in flight).
  const lastSavedRef = useRef((initialNotes ?? "").trim());
  const lastSentRef = useRef((initialNotes ?? "").trim());
  // Counts the saves begun; a result whose number isn't the latest is dropped.
  const saveGenerationRef = useRef(0);
  const updateBlackoutRef = useRef(updateBlackout);
  const blackoutIdRef = useRef(blackoutId);
  useEffect(() => {
    updateBlackoutRef.current = updateBlackout;
    blackoutIdRef.current = blackoutId;
  }, [updateBlackout, blackoutId]);

  async function send(text: string): Promise<boolean> {
    lastSentRef.current = text;
    try {
      await updateBlackoutRef.current({
        blackoutId: blackoutIdRef.current,
        body: { host_notes: text || null },
      }).unwrap();
      lastSavedRef.current = text;
      return true;
    } catch {
      lastSentRef.current = lastSavedRef.current;
      return false;
    }
  }

  async function saveNotes(value: string) {
    const text = value.trim();
    if (text === lastSentRef.current) return;
    saveGenerationRef.current += 1;
    const generation = saveGenerationRef.current;
    setIsSaving(true);
    const ok = await send(text);
    if (generation !== saveGenerationRef.current) return;
    setIsSaving(false);
    if (ok) showSuccess("Notes saved.");
    else showError(NOTES_SAVE_FAILED);
  }

  function cancelPendingSave() {
    if (saveTimerRef.current === null) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setNotes(value);
    notesRef.current = value;
    cancelPendingSave();
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveNotes(value);
    }, NOTES_SAVE_DELAY_MS);
  }

  function handleBlur() {
    cancelPendingSave();
    void saveNotes(notes);
  }

  // Closing within the debounce window must not lose the edit: save it now, if it's new.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current === null) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const text = notesRef.current.trim();
      if (text === lastSentRef.current) return;
      void send(text).then((ok) => {
        if (!ok) showError(NOTES_SAVE_FAILED);
      });
    };
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label
          htmlFor={`notes-${blackoutId}`}
          className="text-sm font-medium"
        >
          Booking notes
        </label>
        {isSaving ? (
          <Loader2 size={12} className="animate-spin text-muted-foreground" aria-label="Saving" />
        ) : null}
      </div>
      <textarea
        id={`notes-${blackoutId}`}
        data-testid="blackout-notes-textarea"
        rows={4}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Guest name, confirmation code, contact info…"
        value={notes}
        maxLength={CALENDAR_NOTES_MAX_LENGTH}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}
