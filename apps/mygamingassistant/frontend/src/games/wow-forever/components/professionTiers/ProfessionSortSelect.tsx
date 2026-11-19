import { Select } from "@platform/ui";
import type { ProfessionSort } from "@/games/wow-forever/types/professionTiers/professionSort";
import type { ProfessionSortChoice } from "@/games/wow-forever/types/professionTiers/professionSortChoice";

interface ProfessionSortSelectProps<K extends string> {
  id: string;
  choices: readonly ProfessionSortChoice<K>[];
  value: ProfessionSort<K>;
  onChange: (sort: ProfessionSort<K>) => void;
}

/** The phone's way to order the cards; from lg up the column headers do it. */
export default function ProfessionSortSelect<K extends string>({ id, choices, value, onChange }: ProfessionSortSelectProps<K>) {
  return (
    <div className="flex flex-col gap-1 lg:hidden">
      <label htmlFor={id} className="text-sm font-medium">
        Sort by
      </label>
      <Select
        id={id}
        value={`${value.key}:${value.direction}`}
        onChange={(e) => {
          const choice = choices.find((c) => c.id === e.target.value);
          if (choice) onChange(choice.sort);
        }}
        className="min-h-[44px] bg-card text-base"
      >
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
