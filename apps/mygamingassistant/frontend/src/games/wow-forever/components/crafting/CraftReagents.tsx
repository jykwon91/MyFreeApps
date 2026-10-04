import CraftMatItem from "@/games/wow-forever/components/crafting/CraftMatItem";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import type { CraftReagent } from "@/games/wow-forever/types/crafting";

interface CraftReagentsProps {
  reagents: readonly CraftReagent[];
  place: CraftPlace;
  professionLabel: string;
  /** How many times the route makes it: the counts become totals ("24× Strange Dust · 1 each"). Without it, per craft. */
  crafts?: number;
}

/** "2× Bolt of Linen Cloth, 1× Coarse Thread" — per craft, or in all for `crafts` makes; each opens to where to get it. */
export default function CraftReagents({ reagents, place, professionLabel, crafts = 1 }: CraftReagentsProps) {
  const total = crafts > 1;
  return (
    <ul
      className="text-sm"
      aria-label={`Materials ${total ? "in all" : "per craft"} — open one for every place to get it`}
    >
      {reagents.map((r) => (
        <CraftMatItem
          key={r.id}
          itemId={r.id}
          label={
            total ? (
              <>
                <span className="font-semibold tabular-nums">{r.count * crafts}×</span> {r.name}
                <span className="text-muted-foreground"> · {r.count} each</span>
              </>
            ) : (
              `${r.count}× ${r.name}`
            )
          }
          place={place}
          professionLabel={professionLabel}
          summaryParts={1}
        />
      ))}
    </ul>
  );
}
