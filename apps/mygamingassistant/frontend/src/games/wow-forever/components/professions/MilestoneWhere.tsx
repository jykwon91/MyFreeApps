import RankTrainerList from "@/games/wow-forever/components/professions/RankTrainerList";
import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import { listedRankTrainers } from "@/games/wow-forever/data/professions/rankTrainers";
import type { MilestoneStep } from "@/games/wow-forever/data/professions/professionTypes";
import { milestoneNpc } from "@/games/wow-forever/lib/milestoneNpc";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface MilestoneWhereProps {
  step: MilestoneStep;
  faction: PlayerFaction;
  /** The player's World Map zone; a trainer there is listed first. Null = not set. */
  zoneId: number | null;
}

/** Where a route milestone happens: every trainer who teaches the rank, and/or the NPC with the book or quest. */
export default function MilestoneWhere({ step, faction, zoneId }: MilestoneWhereProps) {
  const npc = milestoneNpc(step, faction);
  if (!step.teaches && !npc) return null;
  return (
    <div className="space-y-1">
      {step.teaches ? (
        <RankTrainerList
          label={`${step.teaches.rank} ${step.teaches.profession}`}
          trainers={listedRankTrainers(step.teaches.profession, step.teaches.rank)[faction]}
          zoneId={zoneId}
        />
      ) : null}
      {npc ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span className="text-sm">
            <span className="font-medium">{npc.name}</span> <span className="text-muted-foreground">{npc.where}</span>
          </span>
          <TrainerMapLink npc={npc} />
        </div>
      ) : null}
    </div>
  );
}
