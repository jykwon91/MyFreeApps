/** How an item tooltip's shard load ended, for the item it was started for. */
export interface ItemTooltipSettled {
  itemId: number;
  failed: boolean;
}
