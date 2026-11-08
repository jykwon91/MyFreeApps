import { Link } from "react-router-dom";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { dungeonHref } from "@/games/wow-forever/lib/ask/askLinks";
import { levelRange } from "@/games/wow-forever/lib/ask/levelRange";
import type { AskDungeonCard } from "@/games/wow-forever/types/ask/askDungeonCard";

interface DungeonCardProps {
  card: AskDungeonCard;
}

/** A dungeon's levels, where its door is and its bosses in order, with a link to its page. */
export default function DungeonCard({ card }: DungeonCardProps) {
  return (
    <section aria-label={card.name} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
      <h3 className="font-semibold">{card.name}</h3>
      <p className="text-muted-foreground">
        {ASK_COPY.levels(levelRange(card.levelMin, card.levelMax))} · {ASK_COPY.canEnter(card.requiredLevel)}
        {card.zones.length ? ` · ${card.zones.join(", ")}` : null}
      </p>
      {card.matchedBoss ? <p>{ASK_COPY.bossMatch(card.matchedBoss)}</p> : null}
      {card.bosses.length ? (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ASK_COPY.bossesHeading}</h4>
          <ol className="list-decimal pl-5">
            {card.bosses.map((boss) => (
              <li key={boss}>{boss}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <Link
        to={dungeonHref(card.slug)}
        className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {ASK_COPY.openDungeon}
      </Link>
    </section>
  );
}
