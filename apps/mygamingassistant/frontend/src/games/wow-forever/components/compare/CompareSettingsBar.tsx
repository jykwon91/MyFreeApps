import { Select } from "@platform/ui";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import HitPctInput from "@/games/wow-forever/components/compare/HitPctInput";
import { findClass, LEVELING_SPEC_ID } from "@/games/wow-forever/data/classes";
import { WEIGHT_BRACKETS } from "@/games/wow-forever/data/weights/statWeights";
import type { CompareSettings } from "@/games/wow-forever/types/compareSettings";
import ClassSelect from "@/games/wow-forever/components/shared/ClassSelect";

interface CompareSettingsBarProps {
  settings: CompareSettings;
  onChange: (patch: Partial<CompareSettings>) => void;
}

const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

export default function CompareSettingsBar({ settings, onChange }: CompareSettingsBarProps) {
  const specs = findClass(settings.classId)?.specs ?? [];
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-4">
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Class</span>
        <ClassSelect value={settings.classId} onChange={(classId) => onChange({ classId })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Spec</span>
        <Select
          value={settings.specId}
          onChange={(e) => onChange({ specId: e.target.value })}
          className="min-h-[44px] bg-card"
        >
          <option value={LEVELING_SPEC_ID}>Leveling (any)</option>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Weights for</span>
        <SegmentedToggle
          label="Weights for"
          options={WEIGHT_BRACKETS}
          value={settings.bracket}
          onChange={(bracket) => onChange({ bracket })}
        />
      </div>
      {settings.bracket === "level60" ? (
        <HitPctInput value={settings.currentHitPct} onChange={(currentHitPct) => onChange({ currentHitPct })} />
      ) : null}
    </div>
  );
}
