import { useState, type FormEvent } from "react";
import { Button, Select } from "@platform/ui";
import BisListStartNote from "@/games/wow-forever/components/gear/bisLists/BisListStartNote";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { MAX_BIS_LIST_NAME_LENGTH } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { BIS_LIST_PHASE, BIS_LIST_PHASES } from "@/games/wow-forever/data/bisLists/bisListPhases";
import { BIS_LIST_START, BIS_LIST_START_OPTIONS } from "@/games/wow-forever/data/bisLists/bisListStartOptions";
import { findClass, firstSpec, WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import { suggestedBisListName } from "@/games/wow-forever/lib/bisLists/bisListText";
import type { BisListDraft } from "@/games/wow-forever/types/bisLists/bisListDraft";

interface BisListCreateFormProps {
  initial: BisListDraft;
  onCreate: (draft: BisListDraft) => void;
  /** Absent when there's no list to go back to. */
  onCancel?: () => void;
}

const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

/** "New list": name, class, spec, what it's for, and whether to start from the recommended picks. */
export default function BisListCreateForm({ initial, onCreate, onCancel }: BisListCreateFormProps) {
  const [draft, setDraft] = useState(initial);
  const specs = findClass(draft.classId)?.specs ?? [];
  const recommended = draft.start === BIS_LIST_START.recommended;
  const askLevel = recommended && draft.phase === BIS_LIST_PHASE.leveling;

  function update(patch: Partial<BisListDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onCreate(draft);
  }

  return (
    <form onSubmit={submit} data-testid="bis-list-create" aria-labelledby="bis-list-create-title" className="rounded-xl border bg-card p-4 space-y-4 min-w-0">
      <h2 id="bis-list-create-title" className="text-lg font-semibold">
        New list
      </h2>
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>List name</span>
        <input
          value={draft.name}
          maxLength={MAX_BIS_LIST_NAME_LENGTH}
          placeholder={suggestedBisListName(draft)}
          onChange={(e) => update({ name: e.target.value })}
          className="border rounded-md px-3 py-2 text-base min-h-[44px] w-full bg-card"
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 min-w-0">
          <span className={FIELD_LABEL}>Class</span>
          <Select
            value={draft.classId}
            onChange={(e) => {
              const classId = e.target.value as WowClassId;
              update({ classId, specId: firstSpec(classId) });
            }}
            className="min-h-[44px] bg-card"
          >
            {WOW_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className={FIELD_LABEL}>Spec</span>
          <Select value={draft.specId} onChange={(e) => update({ specId: e.target.value })} className="min-h-[44px] bg-card">
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>For</span>
        <SegmentedToggle label="What the list is for" options={BIS_LIST_PHASES} value={draft.phase} onChange={(phase) => update({ phase })} className="self-start flex-wrap" />
      </div>
      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Start from</span>
        <SegmentedToggle label="Start from" options={BIS_LIST_START_OPTIONS} value={draft.start} onChange={(start) => update({ start })} className="self-start flex-wrap" />
        {recommended ? <BisListStartNote phase={draft.phase} /> : null}
      </div>
      {askLevel ? (
        <div className="max-w-[12rem]">
          <NumberField label="Level" value={draft.level} min={1} max={MAX_LEVEL} onChange={(level) => update({ level })} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Create list</Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
