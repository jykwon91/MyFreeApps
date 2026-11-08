import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import type { AskItemsCard } from "@/games/wow-forever/types/ask/askItemsCard";

interface ItemsCardProps {
  card: AskItemsCard;
}

/** Items by name, each linking to its item page (hover shows its tooltip). */
export default function ItemsCard({ card }: ItemsCardProps) {
  return (
    <section aria-label={card.query} className="rounded-xl border bg-card p-3">
      <ul className="divide-y">
        {card.items.map((item) => (
          <li key={item.id} className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 py-1.5 text-sm">
            <ItemNameLink itemId={item.id} name={item.name} item={item} className={QUALITY_TEXT_CLASSES[item.quality]} />
            <span className="text-xs text-muted-foreground">
              {SLOT_LABELS[item.slot]}
              {item.requiredLevel > 0 ? ` · ${ASK_COPY.requiredLevel(item.requiredLevel)}` : null}
            </span>
          </li>
        ))}
      </ul>
      {card.total > card.items.length ? (
        <p className="pt-2 text-xs text-muted-foreground">{ASK_COPY.itemsMore(card.total, card.items.length)}</p>
      ) : null}
    </section>
  );
}
