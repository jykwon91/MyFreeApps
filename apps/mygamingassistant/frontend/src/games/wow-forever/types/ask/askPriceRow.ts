/** One item on the prices card, its figures already formatted ("1g 20s 5c", "601 in 98 auctions"). */
export interface AskPriceRow {
  itemId: number;
  name: string;
  price: string;
  onSale: string;
}
