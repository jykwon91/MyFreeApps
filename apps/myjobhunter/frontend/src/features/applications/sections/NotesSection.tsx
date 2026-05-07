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
import { useUpdateApplicationMutation } from "@/lib/applicationsApi";
import { extractErrorMessage } from "@platform/ui";

interface NotesSectionProps {
  applicationId: string;
  /** The notes value from the most recent server payload. */
  initialValue: string;
}

const DEBOUNCE_MS = 500;

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export default function NotesSection({ applicationId, initialValue }: NotesSectionProps) {
  const [value, setValue] = useState(initialValue);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [updateApplication] = useUpdateApplicationMutation();

  const debounceRef = useRef<number | null>(null);
  const lastSavedRef = useRef(initialValue);

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
    setSaveState({ status: "saving" });
    try {
      await updateApplication({
        id: applicationId,
        patch: { notes: next },
      }).unwrap();
      lastSavedRef.current = next;
      setSaveState({ status: "saved" });
    } catch (err) {
      setSaveState({
        status: "error",
        message: extractErrorMessage(err),
      });
    }
  }

  function scheduleSave(next: string) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void performSave(next);
    }, DEBOUNCE_MS);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    if (next === lastSavedRef.current) {
      setSaveState({ status: "idle" });
      return;
    }
    scheduleSave(next);
  }

  function handleRetry() {
    void performSave(value);
  }

  // Cleanup any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <section>
      <header className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">Notes</h2>
        <SaveStatus state={saveState} onRetry={handleRetry} />
      </header>
      <textarea
        value={value}
        onChange={handleChange}
        rows={6}
        placeholder="Add notes — interview takeaways, recruiter conversations, follow-up plans…"
        className="w-full rounded-md border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        aria-label="Application notes"
      />
    </section>
  );
}

interface SaveStatusProps {
  state: SaveState;
  onRetry: () => void;
}

function SaveStatus({ state, onRetry }: SaveStatusProps) {
  if (state.status === "idle") return null;
  if (state.status === "saving") {
    return <span className="text-xs text-muted-foreground">Saving…</span>;
  }
  if (state.status === "saved") {
    return <span className="text-xs text-muted-foreground">Saved</span>;
  }
  // error
  return (
    <span className="text-xs text-destructive flex items-center gap-2">
      Save failed — {state.message}
      <button
        type="button"
        onClick={onRetry}
        className="underline hover:no-underline font-medium"
      >
        Retry
      </button>
    </span>
  );
}
