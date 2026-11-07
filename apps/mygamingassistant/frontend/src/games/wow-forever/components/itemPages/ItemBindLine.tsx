import { Skeleton } from "@platform/ui";
import { bindText } from "@/games/wow-forever/lib/itemPages/describeItem";
import type { ItemPageFacts } from "@/games/wow-forever/types/itemPages/itemPageFacts";

interface ItemBindLineProps {
  /** null while the item's shard loads: the line's place is kept so nothing moves when it arrives. */
  facts: ItemPageFacts | null;
}

/** The tooltip's "Binds when …" line, a same-height placeholder while it loads, or nothing for an item that doesn't bind. */
export default function ItemBindLine({ facts }: ItemBindLineProps) {
  if (facts === null) {
    return (
      <div aria-hidden className="flex h-5 items-center" data-testid="item-stats-bind-loading">
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }
  if (facts.bind === null) return null;
  return <p>{bindText(facts.bind)}</p>;
}
