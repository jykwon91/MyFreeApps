import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateBlackoutMutation } from "@/shared/store/calendarApi";

// Debounce delay for saving notes on blur (ms).
const NOTES_SAVE_DELAY_MS = 600;

export interface CalendarEventNotesSectionProps {
  blackoutId: string;
  initialNotes: string | null;
}

export default function CalendarEventNotesSection({ blackoutId, initialNotes }: CalendarEventNotesSectionProps) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [updateBlackout] = useUpdateBlackoutMutation();

  const saveNotes = useCallback(
    async (value: string) => {
      setIsSaving(true);
      try {
        await updateBlackout({
          blackoutId,
          body: { host_notes: value.trim() || null },
        }).unwrap();
        showSuccess("Notes saved.");
      } catch {
        showError("I couldn't save the notes. Want to try again?");
      } finally {
        setIsSaving(false);
      }
    },
    [blackoutId, updateBlackout],
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setNotes(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveNotes(value);
    }, NOTES_SAVE_DELAY_MS);
  }

  function handleBlur() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void saveNotes(notes);
  }

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
        className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        placeholder="Guest name, confirmation code, contact info…"
        value={notes}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={isSaving}
      />
    </div>
  );
}
