import { Select } from "@platform/ui";
import { WRIT_SORT_CHOICES } from "@/games/wow-forever/data/professions/writs/writSortOptions";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";

interface WritsSortSelectProps {
  value: WritSort;
  onChange: (sort: WritSort) => void;
}

/** The phone's way to order the cards; from lg up the column headers do it. */
export default function WritsSortSelect({ value, onChange }: WritsSortSelectProps) {
  return (
    <div className="flex flex-col gap-1 lg:hidden">
      <label htmlFor="writ-sort" className="text-sm font-medium">
        Sort by
      </label>
      <Select
        id="writ-sort"
        value={`${value.key}:${value.direction}`}
        onChange={(e) => {
          const choice = WRIT_SORT_CHOICES.find((c) => c.id === e.target.value);
          if (choice) onChange(choice.sort);
        }}
        className="min-h-[44px] bg-card text-base"
      >
        {WRIT_SORT_CHOICES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
