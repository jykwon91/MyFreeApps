import AskCardLink from "@/games/wow-forever/components/ask/cards/AskCardLink";
import AskSpotsPicker from "@/games/wow-forever/components/ask/cards/AskSpotsPicker";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import type { AskGoldCard } from "@/games/wow-forever/types/ask/askGoldCard";

interface GoldCardProps {
  card: AskGoldCard;
}

/** Making gold at a level: the page's top tips, then the best farm spots on a small map. */
export default function GoldCard({ card }: GoldCardProps) {
  const heading = ASK_COPY.goldHeading(card.level);
  return (
    <section aria-label={heading} className="space-y-3 rounded-xl border bg-card p-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <div className="space-y-1">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ASK_COPY.goldTipsHeading}</h4>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {card.tips.map((tip) => (
            <li key={tip.title}>
              <span className="font-medium">{tip.title}</span>
              <span className="block text-xs text-muted-foreground">{tip.detail}</span>
            </li>
          ))}
        </ol>
      </div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ASK_COPY.goldSpotsHeading}</h4>
      <AskSpotsPicker rows={card.rows} origin={null} />
      <p className="text-xs text-muted-foreground">{ASK_COPY.vendorNote}</p>
      <AskCardLink to={card.pageHref}>{ASK_COPY.openGold}</AskCardLink>
    </section>
  );
}
