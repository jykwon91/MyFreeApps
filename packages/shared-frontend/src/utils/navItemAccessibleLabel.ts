import type { NavItem } from "../components/layout/AppShell";

/**
 * A nav link's aria-label: its label plus its dot label when the item has a dot,
 * just its label on the collapsed (icon-only) rail, and none otherwise (the
 * visible text names the link).
 */
export function navItemAccessibleLabel(
  item: Pick<NavItem, "label" | "dotLabel">,
  collapsed: boolean,
): string | undefined {
  if (item.dotLabel) return `${item.label} (${item.dotLabel})`;
  return collapsed ? item.label : undefined;
}
