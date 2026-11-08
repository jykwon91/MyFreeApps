import { useState } from "react";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import { CLASSIC_TRAINERS_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import { orderRankTrainers } from "@/games/wow-forever/data/professions/rankTrainers";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";

/** How many trainers show before "Show all" — keeps a rank-up step short on a phone. */
const VISIBLE = 3;

interface RankTrainerListProps {
  /** "Journeyman Tailoring" — names the list for screen readers. */
  label: string;
  trainers: readonly RankTrainer[];
  /** The player's World Map zone; a trainer there is listed first. */
  zoneId: number | null;
}

/** Everyone who teaches a rank to your faction: name, area, coordinates and a map link. */
export default function RankTrainerList({ label, trainers, zoneId }: RankTrainerListProps) {
  const [expanded, setExpanded] = useState(false);
  const ordered = orderRankTrainers(trainers, zoneId);
  const shown = expanded ? ordered : ordered.slice(0, VISIBLE);
  return (
    <div className="space-y-1">
      <ul aria-label={`${label} trainers`} className="space-y-0.5">
        {shown.map((npc) => (
          <li key={npc.npcId} className="flex flex-wrap items-center justify-between gap-x-3">
            <span className="text-sm">
              <span className="font-medium">{npc.name}</span>{" "}
              <span className="text-muted-foreground">
                {npc.where} · {formatCoord(npc.x)}, {formatCoord(npc.y)}
              </span>
            </span>
            <TrainerMapLink npc={npc} />
          </li>
        ))}
      </ul>
      {ordered.length > VISIBLE ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex items-center text-sm text-primary underline-offset-2 hover:underline min-h-[44px] sm:min-h-[32px]"
        >
          {expanded ? "Show fewer" : `Show all ${ordered.length} trainers`}
        </button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        <ProvenanceBadge {...CLASSIC_TRAINERS_TAG} />
      </p>
    </div>
  );
}
