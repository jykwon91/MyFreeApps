import { Link } from "react-router-dom";
import { FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ItemPageFootnoteProps {
  faction: PlayerFaction;
  clientBuild: string;
}

/** Where each part of the page comes from. */
export default function ItemPageFootnote({ faction, clientBuild }: ItemPageFootnoteProps) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground">
      <p>
        {FACTION_NAME[faction]} vendors and quests are listed first.{" "}
        <Link to="/wow-forever/map" className="text-primary underline-offset-2 hover:underline">
          Change your faction on the World Map
        </Link>
        .
      </p>
      <p>
        Stats, bind, vendor price and recipes are read from the WoW Forever client (build {clientBuild}). Vendors, quests,
        drops and drop chances are Classic data (cmangos classic-db). Sources in Forever's new
        zones aren't listed yet.
      </p>
    </aside>
  );
}
