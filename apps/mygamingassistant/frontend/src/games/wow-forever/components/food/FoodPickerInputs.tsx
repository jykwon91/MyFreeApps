import { Select } from "@platform/ui";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { findClass, LEVELING_SPEC_ID, WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { FOOD_ACTIVITIES } from "@/games/wow-forever/food/foodActivities";
import type { FoodPickerSettings } from "@/games/wow-forever/hooks/useFoodPickerSettings";

interface FoodPickerInputsProps {
  settings: FoodPickerSettings;
  onChange: (patch: Partial<FoodPickerSettings>) => void;
}

const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

function wholeNumber(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

/** Level, class, spec, activity and (optional) Cooking skill. */
export default function FoodPickerInputs({ settings, onChange }: FoodPickerInputsProps) {
  const specs = findClass(settings.classId)?.specs ?? [];
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <NumberField
          label="Your level"
          value={settings.level}
          min={1}
          onChange={(level) => onChange({ level: wholeNumber(level) })}
        />
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>Class</span>
          <Select
            value={settings.classId}
            onChange={(e) => onChange({ classId: e.target.value as WowClassId })}
            className="min-h-[44px] bg-card"
          >
            {WOW_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>Spec</span>
          <Select value={settings.specId} onChange={(e) => onChange({ specId: e.target.value })} className="min-h-[44px] bg-card">
            <option value={LEVELING_SPEC_ID}>Leveling (any)</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
        <NumberField
          label="Cooking skill (optional)"
          value={settings.cookingSkill}
          min={1}
          onChange={(cookingSkill) => onChange({ cookingSkill: wholeNumber(cookingSkill) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>What are you doing?</span>
        <SegmentedToggle
          label="What are you doing?"
          options={FOOD_ACTIVITIES}
          value={settings.activity}
          onChange={(activity) => onChange({ activity })}
          className="flex-wrap self-start"
        />
      </div>
    </div>
  );
}
