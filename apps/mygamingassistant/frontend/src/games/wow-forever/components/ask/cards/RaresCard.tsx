import AskCardLink from "@/games/wow-forever/components/ask/cards/AskCardLink";
import AskSpotsPicker from "@/games/wow-forever/components/ask/cards/AskSpotsPicker";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import type { AskRaresCard } from "@/games/wow-forever/types/ask/askRaresCard";

interface RaresCardProps {
  card: AskRaresCard;
}

/** Rares that fit the level, nearest the player's zone first, on a small map — and the Rares list. */
export default function RaresCard({ card }: RaresCardProps) {
  const heading = ASK_COPY.raresHeading(card.level);
  return (
    <section aria-label={heading} className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold">{heading}</h3>
        <span className="text-xs text-muted-foreground">
          {card.origin ? `${ASK_COPY.nearLabel} ${card.origin.label} · ` : null}
          {ASK_COPY.raresFound(card.rows.length, card.total)}
        </span>
      </div>
      <AskSpotsPicker rows={card.rows} origin={card.origin} />
      <AskCardLink to={card.pageHref}>{ASK_COPY.openRares}</AskCardLink>
    </section>
  );
}
