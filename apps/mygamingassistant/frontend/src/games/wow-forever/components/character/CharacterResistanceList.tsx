import { RESISTANCE_LABELS } from "@/games/wow-forever/data/character/characterStatsConfig";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import type { CharacterResistances } from "@/games/wow-forever/types/character/characterResistances";

/** Total resistance to each school, in the game pane's order. */
export default function CharacterResistanceList({ resistances }: { resistances: CharacterResistances }) {
  return (
    <dl aria-label="Resistances" className="grid grid-cols-5 gap-1 rounded-xl border bg-card p-2 text-center text-sm">
      {RESISTANCE_LABELS.map(([key, label]) => (
        <div key={key} className="min-w-0 py-1">
          <dt className="truncate text-xs text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{formatWhole(resistances[key])}</dd>
        </div>
      ))}
    </dl>
  );
}
