/** What a profile list section knows about its list: the items once loaded, and whether the last load failed. */
export interface ProfileListState<Item> {
  /** Undefined until the first load lands; kept on screen when a refresh fails. */
  items: readonly Item[] | undefined;
  hasError: boolean;
  retry: () => void | Promise<void>;
}
