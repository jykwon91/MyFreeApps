/**
 * Notes section with debounced auto-save.
 *
 * UX contract:
 * - Operator types -> 500ms debounce -> PATCH fires.
 * - Status indicator: "Saving…" / "Saved" / "Save failed — retry".
 * - On failure, the user sees an inline retry button — never a silent swallow
 *   (per ``no-bandaid-solutions``).
 * - Notes render as plain text only — never ``dangerouslySetInnerHTML`` per
 *   the security review.
 */
import { useEffect, useRef, useState } from "react";
import { useUpdateApplicationMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { APPLICATION_NOTES_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { tooLongProblem } from "@myjobhunter/api-client/utils/tooLongProblem";
import { extractErrorMessage, FieldFeedback, fieldFeedbackAria } from "@platform/ui";
import NotesSaveStatus from "./NotesSaveStatus";
import type { NotesSaveState } from "./NotesSaveState";

interface NotesSectionProps {
  applicationId: string;
  /** The notes value from the most recent server payload. */
  initialValue: string;
}

const DEBOUNCE_MS = 500;
const NOTES_FIELD_ID = "application-notes";

export default function NotesSection({ applicationId, initialValue }: NotesSectionProps) {
  const [value, setValue] = useState(initialValue);
  const [saveState, setSaveState] = useState<NotesSaveState>({ status: "idle" });
  const [updateApplication] = useUpdateApplicationMutation();
  const updateApplicationRef = useRef(updateApplication);
  const applicationIdRef = useRef(applicationId);
  useEffect(() => {
    updateApplicationRef.current = updateApplication;
    applicationIdRef.current = applicationId;
  }, [updateApplication, applicationId]);

  const debounceRef = useRef<number | null>(null);
  const lastSavedRef = useRef(initialValue);
  const valueRef = useRef(initialValue);
  // Counts the saves begun and the edits that outdate one; a result whose number isn't the latest is dropped.
  const saveGenerationRef = useRef(0);

  // Re-sync from server on prop change (e.g. drawer reopens with a different
  // application id) — but only when the user hasn't typed anything yet.
  useEffect(() => {
    if (saveState.status === "idle" && value === lastSavedRef.current) {
      setValue(initialValue);
      lastSavedRef.current = initialValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue, applicationId]);

  async function performSave(next: string) {
    saveGenerationRef.current += 1;
    const generation = saveGenerationRef.current;
    setSaveState({ status: "saving" });
    try {
      await updateApplication({
        id: applicationId,
        patch: { notes: next },
      }).unwrap();
      lastSavedRef.current = next;
      if (generation !== saveGenerationRef.current) return;
      setSaveState({ status: "saved" });
    } catch (err) {
      if (generation !== saveGenerationRef.current) return;
      setSaveState({
        status: "error",
        message: extractErrorMessage(err),
      });
    }
  }

  function cancelPendingSave() {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }

  function scheduleSave(next: string) {
    cancelPendingSave();
    debounceRef.current = window.setTimeout(() => {
      void performSave(next);
    }, DEBOUNCE_MS);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    valueRef.current = next;
    // Over the backend's limit the save would only be refused, so none is sent (nor an earlier, stale one,
    // pending or already in flight: its result is dropped).
    if (tooLongProblem(next, APPLICATION_NOTES_MAX_LENGTH)) {
      cancelPendingSave();
      saveGenerationRef.current += 1;
      setSaveState({ status: "idle" });
      return;
    }
    if (next === lastSavedRef.current) {
      setSaveState({ status: "idle" });
      return;
    }
    scheduleSave(next);
  }

  function handleRetry() {
    if (notesProblem) return;
    void performSave(value);
  }

  // Closing within the debounce window must not lose the edit: save it now, if it fits and is new.
  useEffect(() => {
    return () => {
      if (debounceRef.current === null) return;
      window.clearTimeout(debounceRef.current);
      const pending = valueRef.current;
      if (pending === lastSavedRef.current || tooLongProblem(pending, APPLICATION_NOTES_MAX_LENGTH)) return;
      void updateApplicationRef.current({ id: applicationIdRef.current, patch: { notes: pending } });
    };
  }, []);

  const notesProblem = tooLongProblem(value, APPLICATION_NOTES_MAX_LENGTH);
  const feedback = { id: NOTES_FIELD_ID, error: notesProblem, counter: characterCounter(value, APPLICATION_NOTES_MAX_LENGTH) };

  return (
    <section>
      <header className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">Notes</h2>
        <NotesSaveStatus state={saveState} onRetry={handleRetry} />
      </header>
      <textarea
        value={value}
        onChange={handleChange}
        rows={6}
        placeholder="Add notes — interview takeaways, recruiter conversations, follow-up plans…"
        className="w-full rounded-md border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        aria-label="Application notes"
        id={NOTES_FIELD_ID}
        {...fieldFeedbackAria(feedback)}
      />
      <FieldFeedback {...feedback} />
    </section>
  );
}
