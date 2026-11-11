import { Fragment } from "react";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import type { ItemRef } from "@/games/wow-forever/types/itemRef";

interface ItemNameListProps {
  items: readonly ItemRef[];
}

/** "Light Leather, Medium Leather", each with its icon before the name. */
export default function ItemNameList({ items }: ItemNameListProps) {
  return (
    <>
      {items.map((item, i) => (
        <Fragment key={item.name}>
          {i > 0 ? ", " : null}
          <ItemIcon itemId={item.id} />
          {item.name}
        </Fragment>
      ))}
    </>
  );
}
