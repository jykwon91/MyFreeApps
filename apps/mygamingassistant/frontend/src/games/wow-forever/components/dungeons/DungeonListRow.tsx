import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { bossCountText, entranceZonesText } from "@/games/wow-forever/lib/dungeons/describeDungeon";
import { dungeonPageHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { instanceLevelText } from "@/games/wow-forever/worldMap/levels";

/** One dungeon in the index: name (and nicknames), level, zone and boss count; the whole row opens its page. */
export default function DungeonListRow({ dungeon }: { dungeon: Dungeon }) {
  const facts = [instanceLevelText(dungeon), entranceZonesText(dungeon.entrances)];
  if (dungeon.bosses.length > 0) facts.push(bossCountText(dungeon.bosses.length));
  return (
    <li>
      <Link
        to={dungeonPageHref(dungeon.slug)}
        className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="dungeon-list-row"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {dungeon.name}
            {dungeon.aliases.length > 0 ? (
              <span className="font-normal text-muted-foreground"> ({dungeon.aliases.join(", ")})</span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">{facts.filter(Boolean).join(" · ")}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
