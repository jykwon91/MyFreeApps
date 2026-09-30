import { CITY_TRAINERS, TOWN_TRAINERS } from "@/games/wow-forever/data/professions/trainers";
import type { Profession } from "@/games/wow-forever/data/professions/professionTypes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface TrainerListProps {
  profession: Profession;
  faction: PlayerFaction;
}

/** Where to train, for the chosen faction only. */
export default function TrainerList({ profession, faction }: TrainerListProps) {
  const cities = CITY_TRAINERS.filter((c) => c.faction === faction);
  const towns = TOWN_TRAINERS[faction][profession];
  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cities.map((c) => {
          const npc = c[profession];
          return (
            <li key={c.city} className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">{c.city}</p>
              <p className="font-semibold">{npc.name}</p>
              <p className="text-xs text-muted-foreground">Map {npc.coords}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-sm">
        <span className="text-muted-foreground">Also in towns: </span>
        {towns.join(", ")}
      </p>
      <p className="text-xs text-muted-foreground">Coordinates are from Classic and may differ slightly in Forever.</p>
    </div>
  );
}
