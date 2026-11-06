import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { PROFESSION_GROUPS, TWO_PROFESSIONS_NOTE, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";

interface ProfessionPickerProps {
  value: GuideProfession;
  onChange: (profession: GuideProfession) => void;
}

const GROUP_CLASS = "grid grid-cols-3 w-full sm:inline-flex sm:flex-wrap sm:w-auto";

/** One choice across labelled groups: crafting, gathering and secondary professions. */
export default function ProfessionPicker({ value, onChange }: ProfessionPickerProps) {
  return (
    <div className="w-full space-y-2" data-testid="profession-picker">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {PROFESSION_GROUPS.map((group) => (
          <div key={group.label} className="w-full space-y-1 sm:w-auto">
            <p className="text-xs font-medium text-muted-foreground" aria-hidden="true">
              {group.label}
            </p>
            <SegmentedToggle<GuideProfession>
              label={`${group.label} professions`}
              options={group.options}
              value={group.options.find((o) => o.id === value)?.id ?? null}
              onChange={onChange}
              className={GROUP_CLASS}
              compact
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{TWO_PROFESSIONS_NOTE}</p>
    </div>
  );
}
