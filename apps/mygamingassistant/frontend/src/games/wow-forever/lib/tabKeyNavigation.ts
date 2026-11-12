/**
 * The ARIA tabs pattern's keys: Left/Right move one tab (wrapping), Home/End
 * jump to the ends. Null for any other key.
 */
export function tabAfterKey<T>(tabs: readonly T[], current: T, key: string): T | null {
  const at = tabs.indexOf(current);
  if (key === "ArrowRight") return tabs[(at + 1) % tabs.length];
  if (key === "ArrowLeft") return tabs[(at - 1 + tabs.length) % tabs.length];
  if (key === "Home") return tabs[0];
  if (key === "End") return tabs[tabs.length - 1];
  return null;
}
