import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import CraftRankTrainer from "@/games/wow-forever/components/crafting/CraftRankTrainer";
import type { CraftingRank } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftRankRowProps {
  rank: CraftingRank;
  faction: PlayerFaction;
  professionLabel: string;
}

/** "At 125: train Expert (needs level 20)" — a full-width break in the route. */
export default function CraftRankRow({ rank, faction, professionLabel }: CraftRankRowProps) {
  return (
    <li className="p-3 bg-muted/40 space-y-1">
      <p className="font-semibold">
        At {rank.skill}: train {rank.name} {professionLabel}{" "}
        <span className="font-normal text-muted-foreground">
          (needs level {rank.level}, raises your cap to {rank.cap})
        </span>{" "}
        {rank.confidence === "unconfirmed" ? <UnconfirmedChip /> : null}
      </p>
      <CraftRankTrainer rank={rank} faction={faction} professionLabel={professionLabel} />
      {rank.headsUp ? (
        <p className="text-sm">
          <span className="font-medium">Heads up: </span>
          {rank.headsUp}
        </p>
      ) : null}
    </li>
  );
}
