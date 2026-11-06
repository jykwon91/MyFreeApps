import { useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { ConfirmDialog, LoadingButton, Select } from "@platform/ui";
import TriageAreaSelect from "@/games/wow-forever/components/featureRequests/triage/TriageAreaSelect";
import TriageCriteriaListField from "@/games/wow-forever/components/featureRequests/triage/TriageCriteriaListField";
import TriagePriorityPicker from "@/games/wow-forever/components/featureRequests/triage/TriagePriorityPicker";
import TriageSheetFrame from "@/games/wow-forever/components/featureRequests/triage/TriageSheetFrame";
import TriageTextField from "@/games/wow-forever/components/featureRequests/triage/TriageTextField";
import { FEATURE_FEASIBILITIES } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_FEASIBILITY_LABEL } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import {
  TRIAGE_CRITERIA_MAX_ITEMS,
  TRIAGE_FIELD_MAX,
  TRIAGE_FOLLOW_UPS_MAX_ITEMS,
} from "@/games/wow-forever/data/featureRequests/triage/triageLimits";
import { draftFromStory, isDraftComplete, patchFromDraft } from "@/games/wow-forever/lib/featureRequests/triage/storyDraft";
import type { TriageEditDraft } from "@/games/wow-forever/types/featureRequests/triage/triageEditDraft";
import type { TriageErrorView } from "@/games/wow-forever/types/featureRequests/triage/triageErrorView";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import type { TriageStoryPatch } from "@/games/wow-forever/types/featureRequests/triage/triageStoryPatch";

interface TriageEditSheetProps {
  /** The freshest copy — after a 412 it's the refreshed story, and the form keeps the edits. */
  story: TriageStory;
  /** A duplicate's "They also noted", added as a new line ("Add note to story"). */
  extraLine: string | null;
  onClose: () => void;
  onSave: (patch: TriageStoryPatch) => Promise<TriageErrorView | null>;
}

/**
 * Edit every story field, each tagged Public or Private. Saves only what changed. Leaving with unsaved
 * edits — the close button, the overlay, or Android Back — asks "Discard changes?".
 */
export default function TriageEditSheet({ story, extraLine, onClose, onSave }: TriageEditSheetProps) {
  const [draft, setDraft] = useState<TriageEditDraft>(() => draftFromStory(story, extraLine));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TriageErrorView | null>(null);
  const saved = useRef(false);
  const patch = patchFromDraft(story, draft);
  const dirty = Object.keys(patch).length > 0;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !saved.current && currentLocation.search !== nextLocation.search,
  );

  const set = <K extends keyof TriageEditDraft>(key: K, value: TriageEditDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const fieldError = (...fields: string[]) =>
    error !== null && fields.some((f) => error.fields.includes(f)) ? error.message : null;

  async function save() {
    if (!dirty) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onSave(patch);
    setBusy(false);
    if (failure === null) {
      saved.current = true;
      onClose();
    } else {
      setError(failure);
    }
  }

  return (
    <>
      <TriageSheetFrame
        title={TRIAGE_COPY.editTitle}
        onClose={onClose}
        footer={
          <>
            <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm text-muted-foreground hover:underline">
              {TRIAGE_COPY.cancel}
            </button>
            <LoadingButton isLoading={busy} loadingText={TRIAGE_COPY.saving} disabled={!isDraftComplete(draft)} onClick={() => void save()}>
              {TRIAGE_COPY.save}
            </LoadingButton>
          </>
        }
      >
        {error !== null && error.fields.length === 0 ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error.message}
          </p>
        ) : null}
        <TriageTextField label="Title" visibility="public" value={draft.title} onChange={(v) => set("title", v)} max={TRIAGE_FIELD_MAX.title} error={fieldError("title")} />
        <TriageTextField label="As a" visibility="public" value={draft.persona} onChange={(v) => set("persona", v)} max={TRIAGE_FIELD_MAX.persona} error={fieldError("persona")} />
        <TriageTextField label="I want" visibility="public" value={draft.i_want} onChange={(v) => set("i_want", v)} max={TRIAGE_FIELD_MAX.i_want} multiline error={fieldError("i_want")} />
        <TriageTextField label="So that" visibility="public" value={draft.so_that} onChange={(v) => set("so_that", v)} max={TRIAGE_FIELD_MAX.so_that} multiline error={fieldError("so_that")} />
        <TriageCriteriaListField
          label={TRIAGE_COPY.whatDoneLooksLike}
          items={draft.acceptance_criteria}
          onChange={(items) => set("acceptance_criteria", items)}
          maxItems={TRIAGE_CRITERIA_MAX_ITEMS}
          maxLength={TRIAGE_FIELD_MAX.criterion}
          error={fieldError("acceptance_criteria")}
        />
        <TriageCriteriaListField
          label="Could come later"
          items={draft.follow_ups}
          onChange={(items) => set("follow_ups", items)}
          maxItems={TRIAGE_FOLLOW_UPS_MAX_ITEMS}
          maxLength={TRIAGE_FIELD_MAX.follow_up}
          error={fieldError("follow_ups")}
        />
        <TriageAreaSelect id="triage-edit-area" value={draft.area} onChange={(area) => set("area", area)} label="Area (Public)" />
        <TriageTextField label="Topic" visibility="public" value={draft.topic} onChange={(v) => set("topic", v)} max={TRIAGE_FIELD_MAX.topic} error={fieldError("topic")} />
        <div className="flex flex-col gap-1">
          <label htmlFor="triage-edit-feasibility" className="text-sm font-medium">
            Can it be built? (Public)
          </label>
          <Select
            id="triage-edit-feasibility"
            value={draft.feasibility}
            onChange={(e) => set("feasibility", FEATURE_FEASIBILITIES.find((f) => f === e.target.value) ?? draft.feasibility)}
            className="min-h-11 bg-card text-base sm:text-sm"
          >
            {FEATURE_FEASIBILITIES.map((f) => (
              <option key={f} value={f}>
                {TRIAGE_FEASIBILITY_LABEL[f]}
              </option>
            ))}
          </Select>
        </div>
        <TriageTextField label="Feasibility note" visibility="public" value={draft.feasibility_note} onChange={(v) => set("feasibility_note", v)} max={TRIAGE_FIELD_MAX.feasibility_note} multiline error={fieldError("feasibility_note")} />
        <div className="space-y-1">
          <span className="block text-sm font-medium">{TRIAGE_COPY.priority} ({TRIAGE_COPY.private})</span>
          <TriagePriorityPicker value={draft.priority} onChange={(p) => set("priority", p)} />
        </div>
        <TriageTextField
          label="Note to players"
          visibility="public"
          hint="Shown to players"
          value={draft.operator_note}
          onChange={(v) => set("operator_note", v)}
          max={TRIAGE_FIELD_MAX.operator_note}
          multiline
          error={fieldError("operator_note")}
        />
      </TriageSheetFrame>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title={TRIAGE_COPY.discardTitle}
        description={TRIAGE_COPY.discardBody}
        confirmLabel={TRIAGE_COPY.discard}
        cancelLabel={TRIAGE_COPY.keepEditing}
        variant="destructive"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </>
  );
}
