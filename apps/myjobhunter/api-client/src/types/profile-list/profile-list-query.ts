/** The part of a list query a profile section needs. */
export interface ProfileListQuery<Item> {
  /**
   * What the cache holds now. Unlike `data`, which shows the last successful result while a reload
   * is pending or has failed, it includes a record taken out after a delete.
   */
  currentData?: { items: Item[] };
  isError: boolean;
  refetch: () => unknown;
}
