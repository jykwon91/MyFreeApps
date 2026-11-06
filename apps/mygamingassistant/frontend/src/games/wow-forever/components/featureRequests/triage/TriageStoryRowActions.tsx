import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import TriageStatusMenu from "@/games/wow-forever/components/featureRequests/triage/TriageStatusMenu";
import TriageUndoBar from "@/games/wow-forever/components/featureRequests/triage/TriageUndoBar";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import type { FeatureStoryStatus } from "@/games/wow-forever/types/featureRequests/featureStoryStatus";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";
import type { TriageStatusOption } from "@/games/wow-forever/types/featureRequests/triage/triageStatusOption";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageStoryRowActionsProps {
  story: TriageStory;
  status: FeatureStoryStatus;
  pending: PendingDelayedAction | undefined;
  onUndo: () => void;
  onPickStatus: (option: TriageStatusOption) => void;
  onEdit: () => void;
  onSetHidden: (hidden: boolean) => Promise<unknown>;
}

/** The expanded row's actions: Undo while a change waits, nothing for a merged story, Unhide for a hidden one. */
export default function TriageStoryRowActions(props: TriageStoryRowActionsProps) {
  const { story } = props;
  const [hiding, setHiding] = useState(false);

  const setHidden = (hidden: boolean) => {
    setHiding(true);
    void props.onSetHidden(hidden).finally(() => setHiding(false));
  };

  if (props.pending !== undefined) return <TriageUndoBar pending={props.pending} onUndo={props.onUndo} />;
  if (story.status === "duplicate") return null;
  if (story.hidden) {
    return (
      <LoadingButton variant="secondary" isLoading={hiding} loadingText={TRIAGE_COPY.saving} onClick={() => setHidden(false)}>
        {TRIAGE_COPY.unhide}
      </LoadingButton>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-2">
      <TriageStatusMenu status={props.status} onPick={props.onPickStatus} />
      <button type="button" onClick={props.onEdit} className={TRIAGE_SECONDARY_BUTTON}>
        {TRIAGE_COPY.edit}
      </button>
      <LoadingButton variant="secondary" isLoading={hiding} loadingText={TRIAGE_COPY.saving} onClick={() => setHidden(true)}>
        {TRIAGE_COPY.hide}
      </LoadingButton>
    </div>
  );
}
