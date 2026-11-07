import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_LABELS, QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface ItemPageHeaderProps {
  item: ClientItem;
  backTo: string;
  backLabel: string;
}

/** Back, the icon, the name in its quality colour, and "Epic · Trinket · item level 58 · requires level 52". */
export default function ItemPageHeader({ item, backTo, backLabel }: ItemPageHeaderProps) {
  const slot = item.itemType ? `${SLOT_LABELS[item.slot]}, ${item.itemType}` : SLOT_LABELS[item.slot];
  const parts = [QUALITY_LABELS[item.quality], slot, `item level ${item.itemLevel}`];
  if (item.requiredLevel > 0) parts.push(`requires level ${item.requiredLevel}`);
  return (
    <header className="flex items-start gap-3">
      <Link
        to={backTo}
        className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
        aria-label={backLabel}
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <GameIcon icon={itemIcon(item.id)} size={48} alt="" className="shrink-0" />
      <div className="min-w-0 space-y-1">
        <h1 className={`text-2xl font-semibold break-words ${QUALITY_TEXT_CLASSES[item.quality]}`}>{item.name}</h1>
        <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>
      </div>
    </header>
  );
}
