import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import CraftRankTrainer from "@/games/wow-forever/components/crafting/CraftRankTrainer";
import type { CraftingRank, RankTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface CraftRankRowProps {
  rank: CraftingRank;
  faction: PlayerFaction;
  professionLabel: string;
  zoneId: number | null;
}

// A book is learned and a quest is earned; every other rank is trained.
const RANK_VERB: Readonly<Record<RankTrainers["kind"], string>> = {
  list: "train",
  dungeon: "train",
  book: "learn",
  quest: "earn",
};

/** "At 125: train Expert (needs level 20)" — a full-width break in the route. */
export default function CraftRankRow({ rank, faction, professionLabel, zoneId }: CraftRankRowProps) {
  const needs = rank.level === undefined ? "" : `needs level ${rank.level}, `;
  return (
    <li className="p-3 bg-muted/40 space-y-1">
      <p className="font-semibold">
        At {rank.skill}: {RANK_VERB[rank.trainers.kind]} {rank.name} {professionLabel}{" "}
        <span className="font-normal text-muted-foreground">
          ({needs}raises your cap to {rank.cap})
        </span>{" "}
        {rank.confidence === "unconfirmed" ? <ProvenanceBadge provenance={PROVENANCE.unconfirmed} /> : null}
      </p>
      <CraftRankTrainer rank={rank} faction={faction} professionLabel={professionLabel} zoneId={zoneId} />
      {rank.headsUp ? (
        <p className="text-sm">
          <span className="font-medium">Heads up: </span>
          {rank.headsUp}
        </p>
      ) : null}
    </li>
  );
}
