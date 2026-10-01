import { AlertTriangle } from "lucide-react";
import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import CraftMapLink from "@/games/wow-forever/components/crafting/CraftMapLink";
import type { CraftingRank } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftRankRowProps {
  rank: CraftingRank;
  faction: PlayerFaction;
  professionLabel: string;
}

function RankTrainer({ rank, faction, professionLabel }: CraftRankRowProps) {
  const t = rank.trainers;
  if (t.kind === "any") return <p className="text-sm">Any {professionLabel} trainer.</p>;
  if (t.kind === "named") {
    const npc = t.trainers[faction];
    return (
      <div className="flex flex-wrap items-center gap-x-3">
        <p className="text-sm">
          <span className="font-medium">{npc.name}</span> <span className="text-muted-foreground">({npc.where})</span>
        </p>
        <TrainerMapLink npc={npc} />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="flex items-start gap-1.5 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <span>
          <span className="font-medium">{t.name}</span>, inside the {t.dungeon} dungeon. {t.detail}
        </span>
      </p>
      <CraftMapLink to={t.dungeonLink} label={`Show the ${t.dungeon} entrance on the map`} />
    </div>
  );
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
      <RankTrainer rank={rank} faction={faction} professionLabel={professionLabel} />
      {rank.headsUp ? (
        <p className="text-sm">
          <span className="font-medium">Heads up: </span>
          {rank.headsUp}
        </p>
      ) : null}
    </li>
  );
}
