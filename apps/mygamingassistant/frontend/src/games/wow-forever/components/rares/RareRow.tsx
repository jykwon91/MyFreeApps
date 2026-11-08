import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import clsx from "clsx";
import RareDrops from "@/games/wow-forever/components/rares/RareDrops";
import RareTargetLine from "@/games/wow-forever/components/rares/RareTargetLine";
import RareTitle from "@/games/wow-forever/components/rares/RareTitle";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RARES_EMPTY } from "@/games/wow-forever/data/rares/raresConfig";
import { rareMapHref } from "@/games/wow-forever/lib/rares/rareMapHref";
import { rareWhereText } from "@/games/wow-forever/lib/rares/rareText";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface RareRowProps {
  rare: Rare;
  seen: boolean;
  onToggleSeen: () => void;
}

/** One rare: who it is, where (with "Show on map"), its `/target` line, drops and the "Seen / killed" tick. */
export default function RareRow({ rare, seen, onToggleSeen }: RareRowProps) {
  const where = rareWhereText(rare);
  const mapHref = rareMapHref(rare);
  return (
    <li
      className={clsx("space-y-3 rounded-xl border bg-card p-3 sm:p-4", seen && "opacity-70")}
      data-testid="rare-row"
      data-rare-id={rare.id}
    >
      <div className="flex items-start justify-between gap-3">
        <RareTitle rare={rare} as="h3" />
        <label className="flex shrink-0 items-center gap-2 text-sm min-h-[44px]">
          <input type="checkbox" checked={seen} onChange={onToggleSeen} className="h-5 w-5" aria-label={`Seen / killed: ${rare.name}`} />
          <span aria-hidden>Seen / killed</span>
        </label>
      </div>
      {where ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5" data-testid="rare-where">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {where}
            <ProvenanceBadge provenance={PROVENANCE.classic} />
          </span>
          {mapHref ? (
            <Link
              to={mapHref}
              className="inline-flex items-center rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] hover:bg-muted/40"
              data-testid="rare-map-link"
            >
              Show on map
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{RARES_EMPTY.newInForever}</p>
      )}
      <RareTargetLine name={rare.name} />
      <RareDrops rare={rare} />
    </li>
  );
}
