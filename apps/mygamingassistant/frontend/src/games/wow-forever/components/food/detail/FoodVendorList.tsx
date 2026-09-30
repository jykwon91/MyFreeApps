import { useState } from "react";
import { Button } from "@platform/ui";
import FoodVendorRow from "@/games/wow-forever/components/food/detail/FoodVendorRow";
import { FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import { splitVendors } from "@/games/wow-forever/food/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";

const FIRST = 3;
const MAX_SHOWN = 30;

interface FoodVendorListProps {
  vendors: readonly VendorSpot[];
  faction: PlayerFaction;
  zoneId: number | null;
}

function vendorKey(v: VendorSpot): string {
  return `${v.npcId}/${v.zoneId}/${v.x}/${v.y}`;
}

/** Vendors you can buy from (your zone first), the other faction's behind a toggle. */
export default function FoodVendorList({ vendors, faction, zoneId }: FoodVendorListProps) {
  const [expanded, setExpanded] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const { yours, other } = splitVendors(vendors, faction, zoneId);
  const shown = yours.slice(0, expanded ? MAX_SHOWN : FIRST);
  const hidden = yours.length - shown.length;
  const otherName = FACTION_NAME[other[0]?.faction ?? ""] ?? "";
  const otherNoun = other.length === 1 ? "vendor" : "vendors";
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Sold by</p>
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((v) => (
            <FoodVendorRow key={vendorKey(v)} vendor={v} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Only {otherName} vendors sell it.</p>
      )}
      {expanded && hidden > 0 ? (
        <p className="text-xs text-muted-foreground">…and {hidden} more across the world.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {hidden > 0 && !expanded ? (
          <Button variant="secondary" onClick={() => setExpanded(true)}>
            Show {Math.min(hidden, MAX_SHOWN - FIRST)} more
          </Button>
        ) : null}
        {other.length > 0 && !showOther ? (
          <Button variant="ghost" onClick={() => setShowOther(true)}>
            Show {other.length} {otherName} {otherNoun}
          </Button>
        ) : null}
      </div>
      {showOther ? (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">
            {otherName} {otherNoun} <span className="font-normal text-muted-foreground">— you can't buy from these</span>
          </p>
          <ul className="space-y-2" aria-label={`${otherName} ${otherNoun}`}>
            {other.slice(0, MAX_SHOWN).map((v) => (
              <FoodVendorRow key={vendorKey(v)} vendor={v} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
