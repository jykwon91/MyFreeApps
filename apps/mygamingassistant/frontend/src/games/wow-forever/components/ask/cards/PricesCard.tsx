import AskCardLink from "@/games/wow-forever/components/ask/cards/AskCardLink";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import PriceCreditLine from "@/games/wow-forever/components/prices/PriceCreditLine";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_LIVE } from "@/games/wow-forever/data/ask/askLiveStates";
import { priceHouseLabel } from "@/games/wow-forever/prices/priceHouseLabel";
import type { AskPricesCard } from "@/games/wow-forever/types/ask/askPricesCard";

interface PricesCardProps {
  card: AskPricesCard;
}

/**
 * Auction prices for what was asked, always with whose auction house they're
 * from and when Blizzard listed them (warning when they're old); a plain line
 * when there are none or they didn't load.
 */
export default function PricesCard({ card }: PricesCardProps) {
  const heading = ASK_COPY.pricesHeading(priceHouseLabel(card.house));
  return (
    <section aria-label={heading} className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      {card.state === ASK_LIVE.error ? <p className="text-sm text-muted-foreground">{ASK_COPY.pricesFailed}</p> : null}
      {card.rows.length ? (
        <ul className="divide-y">
          {card.rows.map((row) => (
            <li key={row.itemId} className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 py-1.5 text-sm">
              <ItemNameLink itemId={row.itemId} name={row.name} withIcon />
              <span className="text-right">
                <span className="font-medium tabular-nums">{row.price}</span>
                <span className="block text-xs text-muted-foreground">{ASK_COPY.onSale(row.onSale)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {card.total > card.rows.length ? (
        <p className="text-xs text-muted-foreground">{ASK_COPY.itemsMore(card.total, card.rows.length)}</p>
      ) : null}
      {card.state === ASK_LIVE.error ? null : (
        <div className="text-xs text-muted-foreground" data-testid="price-credit">
          <PriceCreditLine house={card.house}sourceUpdatedAt={card.sourceUpdatedAt} hasPrices={card.state === ASK_LIVE.ready} />
        </div>
      )}
      <AskCardLink to={card.pageHref}>{ASK_COPY.openAuctionHouse}</AskCardLink>
    </section>
  );
}
