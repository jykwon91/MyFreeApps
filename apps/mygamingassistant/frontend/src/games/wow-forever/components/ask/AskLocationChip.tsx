import { useId, useState } from "react";
import clsx from "clsx";
import { MapPin } from "lucide-react";
import WhereAreYou from "@/games/wow-forever/components/worldMap/WhereAreYou";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_FACTION_LABEL } from "@/games/wow-forever/data/ask/askFactionLabels";
import { savedOrigin } from "@/games/wow-forever/lib/ask/resolveAskOrigin";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";
import { FACTION } from "@/games/wow-forever/types/worldMap";

interface AskLocationChipProps {
  tools: AskToolDataState;
}

const PLAYER_FACTIONS = [FACTION.alliance, FACTION.horde] as const;

/**
 * Where "nearest" starts when the question doesn't say, and your faction —
 * the World Map's saved choices, edited here with the map's own picker.
 */
export default function AskLocationChip({ tools }: AskLocationChipProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { data, player, updatePlayer } = tools;
  if (data === null) return null;
  const origin = savedOrigin(player, data.world);
  return (
    <div className="space-y-2" data-section="location">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MapPin className="h-4 w-4" aria-hidden />
          {origin ? `${ASK_COPY.locationLabel}: ${origin.label}` : ASK_COPY.locationUnset}
        </button>
        <div role="radiogroup" aria-label={ASK_COPY.factionLabel} className="inline-flex rounded-full border p-0.5">
          {PLAYER_FACTIONS.map((faction) => (
            <button
              key={faction}
              type="button"
              role="radio"
              aria-checked={player.faction === faction}
              onClick={() => updatePlayer({ faction })}
              className={clsx(
                "min-h-[40px] rounded-full px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                player.faction === faction ? "bg-primary text-primary-foreground" : "hover:bg-muted/50",
              )}
            >
              {ASK_FACTION_LABEL[faction]}
            </button>
          ))}
        </div>
      </div>
      {open ? (
        <div id={panelId} className="space-y-1 rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">{ASK_COPY.locationHelp}</p>
          <WhereAreYou
            data={data.world}
            places={data.places}
            zoneId={player.zoneId}
            position={player.position}
            onSet={(zoneId, position) => updatePlayer({ zoneId, position })}
          />
        </div>
      ) : null}
    </div>
  );
}
