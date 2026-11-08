/** One item on the prices card, its figures already formatted ("1g 20s 5c", "12"). */
export interface AskPriceRow {
  itemId: number;
  name: string;
  price: string;
  soldPerDay: string;
}
