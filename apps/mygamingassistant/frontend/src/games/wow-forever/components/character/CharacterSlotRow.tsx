import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import CharacterItemDetails from "@/games/wow-forever/components/character/CharacterItemDetails";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import type { SlotContent } from "@/games/wow-forever/lib/character/characterGear";
import { characterItemQuality } from "@/games/wow-forever/lib/character/characterItemQuality";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { PaperDollSlot } from "@/games/wow-forever/types/character/paperDollSlot";

interface CharacterSlotRowProps {
  slot: PaperDollSlot;
  content: SlotContent;
}

const EMPTY_TEXT: Record<Exclude<SlotContent["kind"], "item">, string> = {
  empty: "Empty",
  two_hand: "Two-hand weapon equipped",
};

/** One gear socket: the item with the stats it rolled, opening to its full tooltip. */
export default function CharacterSlotRow({ slot, content }: CharacterSlotRowProps) {
  const [open, setOpen] = useState(false);
  if (content.kind !== "item") {
    return (
      <li className="flex min-h-[52px] items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <span className="h-8 w-8 shrink-0 rounded border border-dashed" aria-hidden />
        <span>
          <span className="font-medium">{slot.label}:</span> {EMPTY_TEXT[content.kind]}
        </span>
      </li>
    );
  }
  const { item } = content;
  return (
    <li className="rounded-lg border bg-card px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-[36px] items-start gap-2 text-left"
      >
        <GameIcon icon={itemIcon(item.item_id)} size={32} alt="" />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className={clsx("truncate text-sm font-medium", QUALITY_TEXT_CLASSES[characterItemQuality(item.quality)])}>
              {item.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {slot.label} · ilvl {item.item_level}
            </span>
          </span>
          {item.stats.length > 0 ? (
            <span className="flex flex-wrap gap-x-2 text-xs">
              {item.stats.map((stat) => (
                <span key={stat.text} className={clsx(stat.equip_bonus && "text-green-700 dark:text-green-400")}>
                  {stat.text}
                </span>
              ))}
            </span>
          ) : null}
          {item.durability_low ? (
            <span className="inline-block rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              Repair soon
            </span>
          ) : null}
        </span>
        <ChevronDown className={clsx("mt-1 h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <CharacterItemDetails item={item} /> : null}
    </li>
  );
}
