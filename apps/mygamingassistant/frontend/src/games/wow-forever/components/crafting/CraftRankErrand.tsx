import { Ship } from "lucide-react";
import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import CraftMapLink from "@/games/wow-forever/components/crafting/CraftMapLink";
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";

interface CraftRankErrandProps {
  /** What to do there: "Buy Expert First Aid – Under Wraps (1 gold in the game files) from". */
  action: string;
  npc: TrainerNpc;
  detail?: string;
  trip: string;
}

/** A rank you get from one NPC (a book vendor, a quest giver), with the trip to reach them. */
export default function CraftRankErrand({ action, npc, detail, trip }: CraftRankErrandProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm">
        {action} <span className="font-medium">{npc.name}</span>{" "}
        <span className="text-muted-foreground">({npc.where})</span>. {detail}
      </p>
      <p className="flex items-start gap-1.5 text-sm">
        <Ship className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <span>{trip}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-3">
        <TrainerMapLink npc={npc} />
        <CraftMapLink to={`/wow-forever/map?to=npc:${npc.npcId}&dir=1`} label={`Directions to ${npc.name}`} />
      </div>
    </div>
  );
}
