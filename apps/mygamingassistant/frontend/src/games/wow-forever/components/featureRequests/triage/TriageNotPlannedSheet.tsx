import { useId, useState } from "react";
import { LoadingButton } from "@platform/ui";
import TriageSheetFrame from "@/games/wow-forever/components/featureRequests/triage/TriageSheetFrame";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_FIELD_MAX } from "@/games/wow-forever/data/featureRequests/triage/triageLimits";
import { TRIAGE_INPUT } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { counterLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import type { TriageErrorView } from "@/games/wow-forever/types/featureRequests/triage/triageErrorView";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageNotPlannedSheetProps {
  story: TriageStory;
  onClose: () => void;
  onSubmit: (note: string) => Promise<TriageErrorView | null>;
}

/** Not planned: a note is required (players see it), prefilled from Claude's feasibility note. */
export default function TriageNotPlannedSheet({ story, onClose, onSubmit }: TriageNotPlannedSheetProps) {
  const inputId = useId();
  const [note, setNote] = useState(story.operator_note ?? story.feasibility_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = counterLabel(note.length, TRIAGE_FIELD_MAX.operator_note);

  async function submit() {
    setBusy(true);
    setError(null);
    const failure = await onSubmit(note.trim());
    setBusy(false);
    if (failure === null) onClose();
    else setError(failure.message);
  }

  return (
    <TriageSheetFrame
      title={TRIAGE_COPY.notPlannedTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm text-muted-foreground hover:underline">
            {TRIAGE_COPY.cancel}
          </button>
          <LoadingButton isLoading={busy} loadingText={TRIAGE_COPY.saving} disabled={note.trim() === ""} onClick={() => void submit()}>
            {TRIAGE_COPY.markNotPlanned}
          </LoadingButton>
        </>
      }
    >
      <p className="font-medium [overflow-wrap:anywhere]">
        <bdi>{story.title}</bdi>
      </p>
      <div className="space-y-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          {TRIAGE_COPY.notPlannedLabel}
        </label>
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          {TRIAGE_COPY.notPlannedHint}
        </p>
        <textarea
          id={inputId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={TRIAGE_FIELD_MAX.operator_note}
          rows={4}
          required
          aria-describedby={`${inputId}-hint`}
          className={TRIAGE_INPUT}
        />
        {counter !== null ? <p className="text-right text-xs text-muted-foreground">{counter}</p> : null}
        {error !== null ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </TriageSheetFrame>
  );
}
