import { TAB_KEYS } from "@/constants/tab-keys";

/**
 * The index of the tab a key moves to from `current`, or null when the key is not a tab-navigation key.
 * Arrow keys wrap around at both ends; Home and End jump to the first and last tab.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case TAB_KEYS.next:
      return (current + 1) % count;
    case TAB_KEYS.previous:
      return (current - 1 + count) % count;
    case TAB_KEYS.first:
      return 0;
    case TAB_KEYS.last:
      return count - 1;
    default:
      return null;
  }
}
