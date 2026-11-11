/** A list the API returns whole, as `{ items, total }`, of records with an id. */
export interface IdListResponse<Item extends { id: string }> {
  items: Item[];
  total: number;
}
