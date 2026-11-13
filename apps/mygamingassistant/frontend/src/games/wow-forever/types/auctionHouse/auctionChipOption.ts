/** One chip in an Auction house filter group. `swatch` = classes for a small coloured dot before the label. */
export interface AuctionChipOption<T extends string> {
  id: T;
  label: string;
  swatch?: string;
}
