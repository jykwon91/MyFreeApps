import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import {
  CRAFTING_GROUP,
  SECONDARY_GROUP,
  TWO_PROFESSIONS_NOTE,
  type GuideProfession,
} from "@/games/wow-forever/data/professions/professionPicker";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";

interface ProfessionPickerProps {
  value: GuideProfession;
  onChange: (profession: GuideProfession) => void;
}

const GROUP_CLASS = "grid grid-cols-3 w-full sm:inline-flex sm:flex-wrap sm:w-auto";

/** One choice across two labelled groups: crafting professions and secondary ones. */
export default function ProfessionPicker({ value, onChange }: ProfessionPickerProps) {
  const crafting = isCraftingProfession(value) ? value : null;
  const secondary = crafting === null ? value : null;
  return (
    <div className="w-full space-y-2" data-testid="profession-picker">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {[
          { group: CRAFTING_GROUP, picked: crafting },
          { group: SECONDARY_GROUP, picked: secondary },
        ].map(({ group, picked }) => (
          <div key={group.label} className="w-full space-y-1 sm:w-auto">
            <p className="text-xs font-medium text-muted-foreground" aria-hidden="true">
              {group.label}
            </p>
            <SegmentedToggle<GuideProfession>
              label={`${group.label} professions`}
              options={group.options}
              value={picked}
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
