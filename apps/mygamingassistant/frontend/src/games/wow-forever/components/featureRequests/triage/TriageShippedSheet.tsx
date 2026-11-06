import { useId, useState } from "react";
import { LoadingButton } from "@platform/ui";
import TriageSheetFrame from "@/games/wow-forever/components/featureRequests/triage/TriageSheetFrame";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_FIELD_MAX } from "@/games/wow-forever/data/featureRequests/triage/triageLimits";
import { TRIAGE_INPUT } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { isValidShippedPath } from "@/games/wow-forever/lib/featureRequests/triage/shippedPathValidator";
import type { TriageErrorView } from "@/games/wow-forever/types/featureRequests/triage/triageErrorView";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageShippedSheetProps {
  story: TriageStory;
  onClose: () => void;
  onSave: (path: string) => Promise<TriageErrorView | null>;
}

const PATH_PREFILL = "/wow-forever/";

/** "Where can players try it?" — a page on this site under /wow-forever; Save stays off until it is one. */
export default function TriageShippedSheet({ story, onClose, onSave }: TriageShippedSheetProps) {
  const inputId = useId();
  const [path, setPath] = useState(story.shipped_path ?? PATH_PREFILL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isValidShippedPath(path.trim());

  async function save() {
    setBusy(true);
    setError(null);
    const failure = await onSave(path.trim());
    setBusy(false);
    if (failure === null) onClose();
    else setError(failure.message);
  }

  return (
    <TriageSheetFrame
      title={TRIAGE_COPY.shippedTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm text-muted-foreground hover:underline">
            {TRIAGE_COPY.cancel}
          </button>
          <LoadingButton isLoading={busy} loadingText={TRIAGE_COPY.saving} disabled={!valid} onClick={() => void save()}>
            {TRIAGE_COPY.markShipped}
          </LoadingButton>
        </>
      }
    >
      <p className="font-medium [overflow-wrap:anywhere]">
        <bdi>{story.title}</bdi>
      </p>
      <div className="space-y-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          {TRIAGE_COPY.shippedPathLabel}
        </label>
        <input
          id={inputId}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          maxLength={TRIAGE_FIELD_MAX.shipped_path}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!valid}
          aria-describedby={`${inputId}-error`}
          className={TRIAGE_INPUT}
        />
        <p id={`${inputId}-error`} role={valid ? undefined : "alert"} className="text-sm text-red-600 dark:text-red-400">
          {valid ? error : TRIAGE_COPY.shippedPathError}
        </p>
      </div>
    </TriageSheetFrame>
  );
}
