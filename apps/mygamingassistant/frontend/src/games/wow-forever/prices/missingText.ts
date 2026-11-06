/** "1 item with no auction price" / "3 items with no auction price". */
export function itemsWithNoPrice(count: number): string {
  const noun = count === 1 ? "item" : "items";
  return `${count} ${noun} with no auction price`;
}
