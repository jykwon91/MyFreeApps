import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import { formatWeapon } from "@/games/wow-forever/lib/describeClientItem";
import { bindText, classesText, weaponDps } from "@/games/wow-forever/lib/itemPages/describeItem";
import { itemStatLines } from "@/games/wow-forever/lib/itemPages/itemStatLines";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ItemPageFacts } from "@/games/wow-forever/types/itemPages/itemPageFacts";

interface ItemStatsBlockProps {
  item: ClientItem;
  facts: ItemPageFacts;
}

/** The item as its in-game tooltip shows it, from the Forever game files. */
export default function ItemStatsBlock({ item, facts }: ItemStatsBlockProps) {
  const lines = itemStatLines(item);
  return (
    <section
      aria-label="Item stats"
      className="rounded-xl border bg-card p-4 space-y-0.5 text-sm max-w-md"
      data-testid="item-stats"
    >
      <p className={`font-semibold ${QUALITY_TEXT_CLASSES[item.quality]}`}>{item.name}</p>
      {facts.bind !== null ? <p>{bindText(facts.bind)}</p> : null}
      <p className="flex justify-between gap-3">
        <span>{SLOT_LABELS[item.slot]}</span>
        {item.itemType ? <span>{item.itemType}</span> : null}
      </p>
      {item.weapon && !item.damageUnknown ? (
        <>
          <p>{formatWeapon(item.weapon)}</p>
          <p>{weaponDps(item.weapon)}</p>
        </>
      ) : null}
      {item.damageUnknown ? <p className="text-muted-foreground">Damage isn't in the game files.</p> : null}
      {item.armor ? <p>{item.armor} Armor</p> : null}
      {lines.map((line) => (
        <p key={line.key} className={line.equip ? "text-green-700 dark:text-green-400" : undefined}>
          {line.text}
        </p>
      ))}
      {item.randomSuffix ? (
        <p className="text-green-700 dark:text-green-400">&lt;Random enchantment&gt; — stats depend on its "of the …" name.</p>
      ) : null}
      {item.otherEffects > 0 ? (
        <p className="text-muted-foreground">
          + {item.otherEffects} other effect{item.otherEffects === 1 ? "" : "s"} (procs, Use:) not listed here
        </p>
      ) : null}
      {item.classes ? <p>{classesText(item.classes)}</p> : null}
      {item.requiredLevel > 0 ? <p>Requires Level {item.requiredLevel}</p> : null}
      <p className="text-amber-700 dark:text-amber-300">Item Level {item.itemLevel}</p>
      {facts.buyPrice !== null ? (
        <p className="pt-1 text-xs text-muted-foreground">Vendor price: {formatPrice(facts.buyPrice)}</p>
      ) : null}
    </section>
  );
}
