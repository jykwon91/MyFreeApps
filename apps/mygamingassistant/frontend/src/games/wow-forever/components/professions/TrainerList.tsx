import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import { CITY_TRAINERS, TOWN_TRAINERS } from "@/games/wow-forever/data/professions/trainers";
import type { Profession } from "@/games/wow-forever/data/professions/professionTypes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";

interface TrainerListProps {
  profession: Profession;
  faction: PlayerFaction;
}

/** Where to train, for the chosen faction only — each trainer opens on the World Map. */
export default function TrainerList({ profession, faction }: TrainerListProps) {
  const cities = CITY_TRAINERS.filter((c) => c.faction === faction);
  const towns = TOWN_TRAINERS[faction][profession];
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cities.map((c) => {
          const npc = c[profession];
          return (
            <li key={c.city} className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">{c.city}</p>
              <p className="font-semibold">{npc.name}</p>
              <p className="text-xs text-muted-foreground">
                {npc.where} · {formatCoord(npc.x)}, {formatCoord(npc.y)}
              </p>
              <TrainerMapLink npc={npc} />
            </li>
          );
        })}
      </ul>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Also in towns:</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          {towns.map((npc) => (
            <li key={npc.npcId} className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="text-sm">
                <span className="font-medium">{npc.name}</span>{" "}
                <span className="text-muted-foreground">({npc.where})</span>
              </span>
              <TrainerMapLink npc={npc} />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">Locations are from Classic and may differ slightly in Forever.</p>
    </div>
  );
}
