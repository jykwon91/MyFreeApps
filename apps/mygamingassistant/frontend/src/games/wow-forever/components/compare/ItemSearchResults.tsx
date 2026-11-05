import { Button } from "@platform/ui";
import ItemSearchResultRow from "@/games/wow-forever/components/compare/ItemSearchResultRow";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface ItemSearchResultsProps {
  listId: string;
  optionId: (item: ClientItem) => string;
  shown: readonly ClientItem[];
  total: number;
  activeIndex: number;
  ambiguousIds: ReadonlySet<number>;
  onPick: (item: ClientItem) => void;
  onShowMore: () => void;
}

/** The listbox the search box controls, then "Show more (n)". */
export default function ItemSearchResults({
  listId,
  optionId,
  shown,
  total,
  activeIndex,
  ambiguousIds,
  onPick,
  onShowMore,
}: ItemSearchResultsProps) {
  const remaining = total - shown.length;
  return (
    <div className="space-y-2">
      <ul id={listId} role="listbox" aria-label="Matching items" className="space-y-1">
        {shown.map((item, i) => (
          <ItemSearchResultRow
            key={item.id}
            id={optionId(item)}
            item={item}
            active={i === activeIndex}
            showId={ambiguousIds.has(item.id)}
            onPick={onPick}
          />
        ))}
      </ul>
      {remaining > 0 ? (
        <Button variant="secondary" size="sm" onClick={onShowMore}>
          Show more ({remaining})
        </Button>
      ) : null}
    </div>
  );
}
