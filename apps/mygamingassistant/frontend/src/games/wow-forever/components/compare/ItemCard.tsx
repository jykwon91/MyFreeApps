import { X } from "lucide-react";
import ItemDetailsEditor from "@/games/wow-forever/components/compare/ItemDetailsEditor";
import ItemInputPanel from "@/games/wow-forever/components/compare/ItemInputPanel";
import ItemNotices from "@/games/wow-forever/components/compare/ItemNotices";
import { fromExtraction, fromParsedText } from "@/games/wow-forever/lib/toCompareItem";
import type { CompareItem, ItemSource } from "@/games/wow-forever/types/compareItem";

interface ItemCardProps {
  item: CompareItem;
  position: number;
  canRemove: boolean;
  onChange: (item: CompareItem) => void;
  onRemove: (id: string) => void;
}

const SOURCE_LABELS: Record<ItemSource, string> = {
  manual: "Entered by hand",
  text: "Read from pasted text",
  screenshot: "Read from screenshot",
};

export default function ItemCard({ item, position, canRemove, onChange, onRemove }: ItemCardProps) {
  const itemLabel = `item ${position}`;
  return (
    <article className="rounded-xl border bg-card p-4 space-y-4" aria-label={`Item ${position}: ${item.name}`}>
      <div className="flex items-start gap-2">
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
      <p className="text-xs text-muted-foreground">{SOURCE_LABELS[item.source]}</p>
      <ItemInputPanel
        itemLabel={itemLabel}
        onTextRead={(parsed) => onChange(fromParsedText(item.id, { ...parsed, name: parsed.name || item.name }))}
        onScreenshotRead={(response) => onChange(fromExtraction(item.id, response))}
      />
      <ItemDetailsEditor item={item} onChange={onChange} />
      <ItemNotices warnings={item.warnings} unparsedEffects={item.unparsedEffects} />
    </article>
  );
}
