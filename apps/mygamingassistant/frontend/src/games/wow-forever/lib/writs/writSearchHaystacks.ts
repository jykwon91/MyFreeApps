import type { WritRow } from "@/games/wow-forever/types/writs/writRow";

/** What a writ search looks at: the writ's name and the name of the item it asks for. */
export function writSearchHaystacks(row: WritRow): string[] {
  const { writ } = row;
  return [writ.name, writ.productName, ...(writ.product ? [writ.product.name] : [])];
}
