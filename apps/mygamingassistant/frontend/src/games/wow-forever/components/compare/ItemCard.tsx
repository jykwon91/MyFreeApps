import { useRef } from "react";
import { X } from "lucide-react";
import ItemDetailsEditor from "@/games/wow-forever/components/compare/ItemDetailsEditor";
import ItemInputPanel from "@/games/wow-forever/components/compare/ItemInputPanel";
import ItemNotices from "@/games/wow-forever/components/compare/ItemNotices";
import ItemSourceNote from "@/games/wow-forever/components/compare/ItemSourceNote";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { resetToGameFiles } from "@/games/wow-forever/lib/itemNumbers";
import { fromClientData, fromExtraction, fromParsedText } from "@/games/wow-forever/lib/toCompareItem";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";

interface ItemCardProps {
  item: CompareItem;
  position: number;
  canRemove: boolean;
  classId: WowClassId;
  bracket: WeightBracket;
  /** The earlier card holding the same game-file item, if any. */
  sameAsPosition: number | null;
  onChange: (item: CompareItem) => void;
  onRemove: (id: string) => void;
}

export default function ItemCard({
  item,
  position,
  canRemove,
  classId,
  bracket,
  sameAsPosition,
  onChange,
  onRemove,
}: ItemCardProps) {
  const itemLabel = `item ${position}`;
  const detailsRef = useRef<HTMLDivElement>(null);

  function pick(record: ClientItem, clientBuild: string) {
    // Picking the same item again keeps whatever the player already changed.
    if (item.origin?.itemId === record.id) return;
    onChange(fromClientData(item.id, record, clientBuild));
  }

  function enterByHand(query: string) {
    if (query && item.origin === null) onChange({ ...item, name: query });
    detailsRef.current?.querySelector<HTMLElement>("select, input")?.focus();
  }

  return (
    <article className="rounded-xl border bg-card p-4 space-y-4" aria-label={`Item ${position}: ${item.name}`}>
      <div className="flex items-start gap-2">
        {item.origin ? <GameIcon icon={itemIcon(item.origin.itemId)} size={32} alt="" className="mt-1.5" /> : null}
        <label className="flex-1 min-w-0">
          <span className="sr-only">Name of {itemLabel}</span>
          <input
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-base font-semibold min-h-[44px] bg-card"
          />
        </label>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${itemLabel}`}
            className="p-2 rounded-md hover:bg-muted/40 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <ItemSourceNote item={item} sameAsPosition={sameAsPosition} onReset={() => onChange(resetToGameFiles(item))} />
      <ItemInputPanel
        item={item}
        itemLabel={itemLabel}
        classId={classId}
        bracket={bracket}
        onPick={pick}
        onEnterByHand={enterByHand}
        onTextRead={(parsed) => onChange(fromParsedText(item.id, { ...parsed, name: parsed.name || item.name }))}
        onScreenshotRead={(response) => onChange(fromExtraction(item.id, response))}
      />
      <div ref={detailsRef}>
        <ItemDetailsEditor item={item} onChange={onChange} />
      </div>
      <ItemNotices warnings={item.warnings} unparsedEffects={item.unparsedEffects} />
    </article>
  );
}
