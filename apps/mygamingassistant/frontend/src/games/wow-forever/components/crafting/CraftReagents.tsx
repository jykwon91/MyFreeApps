import CraftMatItem from "@/games/wow-forever/components/crafting/CraftMatItem";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import type { CraftReagent } from "@/games/wow-forever/types/crafting";

interface CraftReagentsProps {
  reagents: readonly CraftReagent[];
  place: CraftPlace;
  professionLabel: string;
}

/** "2× Bolt of Linen Cloth, 1× Coarse Thread" — per craft; each opens to where to get it. */
export default function CraftReagents({ reagents, place, professionLabel }: CraftReagentsProps) {
  return (
    <ul className="text-sm" aria-label="Materials per craft — open one to see where to get it">
      {reagents.map((r) => (
        <CraftMatItem
          key={r.id}
          itemId={r.id}
          label={`${r.count}× ${r.name}`}
          place={place}
          professionLabel={professionLabel}
          showSummary={false}
        />
      ))}
    </ul>
  );
}
