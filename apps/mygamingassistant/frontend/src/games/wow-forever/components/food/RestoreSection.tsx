import RestoreMageRow from "@/games/wow-forever/components/food/RestoreMageRow";
import RestoreOptionRow from "@/games/wow-forever/components/food/RestoreOptionRow";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { reagentSourcesFor } from "@/games/wow-forever/data/food/recipeSourceData";
import type { RestoreChoices } from "@/games/wow-forever/types/restoreChoices";
import type { RestoreTrack } from "@/games/wow-forever/types/restoreTrack";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

const TITLE: Record<RestoreTrack, string> = { food: "Food", drink: "Drink" };
const SUBTITLE: Record<RestoreTrack, string> = { food: "Gives health back while you sit", drink: "Gives mana back while you sit" };

interface RestoreSectionProps {
  track: RestoreTrack;
  choices: RestoreChoices;
  faction: PlayerFaction;
}

/** One column of the page: a Mage's free one first, then more ways to get it, cheapest first. */
export default function RestoreSection({ track, choices, faction }: RestoreSectionProps) {
  const { prices } = useAuctionPrices();
  const empty = choices.mage === null && choices.others.length === 0;
  return (
    <section aria-labelledby={`restore-${track}`} className="space-y-2" data-testid={`restore-${track}`}>
      <div>
        <h2 id={`restore-${track}`} className="text-base font-semibold">
          {TITLE[track]}
        </h2>
        <p className="text-xs text-muted-foreground">{SUBTITLE[track]}</p>
      </div>
      {empty ? <p className="text-sm text-muted-foreground">Nothing at your level yet.</p> : null}
      <ol className="space-y-2">
        {choices.mage ? <RestoreMageRow option={choices.mage} track={track} /> : null}
        {choices.others.map((o) => (
          <RestoreOptionRow
            key={o.id}
            option={o}
            track={track}
            faction={faction}
            sources={reagentSourcesFor(o.id)}
            auctionCopper={prices ? auctionCopper(prices, o.id) : null}
          />
        ))}
      </ol>
    </section>
  );
}
