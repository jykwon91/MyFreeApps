import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { PROFESSION_GROUPS, TWO_PROFESSIONS_NOTE, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";

interface ProfessionPickerProps {
  value: GuideProfession;
  onChange: (profession: GuideProfession) => void;
  /** The selected character's professions: listed first, in their own group. */
  mine?: readonly GuideProfession[];
}

/** Each group with every profession's in-game icon on its button. */
const GROUPS = PROFESSION_GROUPS.map((group) => ({
  ...group,
  options: group.options.map((o) => ({ ...o, icon: professionIcon(o.id) })),
}));

const MINE_LABEL = "Yours";

/** The character's professions first as one group; the rest stay in their groups. */
function groupsFor(mine: readonly GuideProfession[]) {
  if (mine.length === 0) return GROUPS;
  const all = GROUPS.flatMap((g) => g.options);
  const yours = mine.flatMap((id) => all.find((o) => o.id === id) ?? []);
  const rest = GROUPS.map((g) => ({ ...g, options: g.options.filter((o) => !mine.includes(o.id)) })).filter((g) => g.options.length > 0);
  return [{ label: MINE_LABEL, options: yours }, ...rest];
}

const GROUP_CLASS = "grid grid-cols-3 w-full sm:inline-flex sm:flex-wrap sm:w-auto";

/** One choice across labelled groups: crafting, gathering and secondary professions. */
export default function ProfessionPicker({ value, onChange, mine = [] }: ProfessionPickerProps) {
  return (
    <div className="w-full space-y-2" data-testid="profession-picker">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {groupsFor(mine).map((group) => (
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
