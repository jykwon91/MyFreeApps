import clsx from "clsx";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";

const BONUS_LINE = "text-green-700 dark:text-green-400";
const GOLD_LINE = "text-amber-700 dark:text-amber-300";

/** The rest of the item's in-game tooltip: type, damage, spells, set, requirements, flavour text. */
export default function CharacterItemDetails({ item }: { item: CharacterItem }) {
  const typeLine = [item.inventory_type_name, item.subclass_name].filter(Boolean).join(" · ");
  return (
    <div className="mt-2 space-y-0.5 border-t pt-2 text-xs" data-testid="character-item-details">
      {item.binding ? <p>{item.binding}</p> : null}
      {typeLine ? <p>{typeLine}</p> : null}
      {item.weapon ? (
        <>
          <p>
            {item.weapon.damage}
            {item.weapon.speed ? <span className="ml-3">{item.weapon.speed}</span> : null}
          </p>
          {item.weapon.dps ? <p>{item.weapon.dps}</p> : null}
        </>
      ) : null}
      {item.armor ? <p>{item.armor}</p> : null}
      {item.enchantments.map((line, i) => (
        <p key={`${i}-${line}`} className={BONUS_LINE}>
          {line}
        </p>
      ))}
      {item.spells.map((line, i) => (
        <p key={`${i}-${line}`} className={BONUS_LINE}>
          {line}
        </p>
      ))}
      {item.set_name ? <p className={GOLD_LINE}>{item.set_name}</p> : null}
      {item.requirements.map((line, i) => (
        <p key={`${i}-${line}`}>{line}</p>
      ))}
      {item.durability ? <p className={clsx(item.durability_low && GOLD_LINE)}>{item.durability}</p> : null}
      <p className="text-muted-foreground">Item level {item.item_level}</p>
      {item.description ? <p className={clsx("italic", GOLD_LINE)}>&ldquo;{item.description}&rdquo;</p> : null}
    </div>
  );
}
