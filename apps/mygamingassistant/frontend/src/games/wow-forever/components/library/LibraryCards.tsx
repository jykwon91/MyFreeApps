import clsx from "clsx";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { LIBRARY_UNKNOWN } from "@/games/wow-forever/data/library/libraryConfig";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LibraryCard } from "@/games/wow-forever/types/library/libraryCard";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** The library cards Forever added: one per city, with how to get one not known yet. */
export default function LibraryCards({ cards }: { cards: readonly LibraryCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="library-cards" data-testid="library-cards">
      <h2 id="library-cards" className="text-base font-semibold">Library cards</h2>
      <p className="text-sm text-muted-foreground">New in Forever. How you get one: {LIBRARY_UNKNOWN.where.toLowerCase()}.</p>
      <ul>
        {cards.map((card) => (
          <li key={card.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 min-h-[44px]" data-testid="library-card">
            <GameIcon icon={itemIcon(card.id)} size={24} alt="" />
            <span className={clsx("text-sm font-medium", QUALITY_TEXT_CLASSES[card.quality])}>{card.name}</span>
            <ProvenanceBadge provenance={PROVENANCE.client} />
          </li>
        ))}
      </ul>
    </section>
  );
}
