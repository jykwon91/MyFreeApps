import { ITEM_BIND, type ItemBind } from "@/games/wow-forever/types/itemPages/itemBind";

/** Whether the item can be on the auction house at all: bind-on-pickup and quest items never are. */
export function isAuctionable(bind: ItemBind | null): boolean {
  return bind !== ITEM_BIND.pickup && bind !== ITEM_BIND.quest;
}
