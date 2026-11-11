import type { NotesSaveState } from "./NotesSaveState";

interface NotesSaveStatusProps {
  state: NotesSaveState;
  onRetry: () => void;
}

/** The "Saving… / Saved / Save failed" indicator beside the notes heading. */
export default function NotesSaveStatus({ state, onRetry }: NotesSaveStatusProps) {
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
