import { Fragment } from "react";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import type { CraftReagent } from "@/games/wow-forever/types/crafting";

interface ItemCountListProps {
  items: readonly CraftReagent[];
  /** Between two items: ", " or " + ". */
  separator?: string;
  /** Between the count and the icon: "" for "2 Linen Cloth", " ×" for "2 × Linen Cloth". */
  countMark?: string;
}

/** "2 Linen Cloth, 3 Rune Thread", each with its icon before the name. */
export default function ItemCountList({ items, separator = ", ", countMark = "" }: ItemCountListProps) {
  return (
    <>
      {items.map((item, i) => (
        <Fragment key={item.id}>
          {i > 0 ? separator : null}
          {item.count}
          {countMark} <ItemIcon itemId={item.id} />
          {item.name}
        </Fragment>
      ))}
    </>
  );
}
