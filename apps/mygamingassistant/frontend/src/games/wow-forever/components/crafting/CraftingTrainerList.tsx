import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import type { CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";

/** Where to train a crafting profession, for the chosen faction — each trainer opens on the World Map. */
export default function CraftingTrainerList({ trainers, faction }: { trainers: CraftingTrainers; faction: PlayerFaction }) {
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {trainers.cities[faction].map(({ city, npc }) => (
          <li key={city} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{city}</p>
            <p className="font-semibold">{npc.name}</p>
            <p className="text-xs text-muted-foreground">
              {npc.where} · {formatCoord(npc.x)}, {formatCoord(npc.y)}
            </p>
            <TrainerMapLink npc={npc} />
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Also in towns:</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          {trainers.towns[faction].map((npc) => (
            <li key={npc.npcId} className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="text-sm">
                <span className="font-medium">{npc.name}</span> <span className="text-muted-foreground">({npc.where})</span>
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
