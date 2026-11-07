import type { NavItem } from "./AppShell";

interface NavItemContentProps {
  item: NavItem;
  /** Icon-only rail: the label is left out (the link carries it as its aria-label). */
  collapsed: boolean;
  /** Bottom-nav layout: the label sits in its own span under the icon. */
  stacked?: boolean;
}

/**
 * A nav item's icon and label, with the optional dot on the icon's corner so it
 * stays visible on the collapsed rail and in the bottom nav. The dot's meaning is
 * read out through the link's aria-label (see `navItemAccessibleLabel`).
 */
export default function NavItemContent({ item, collapsed, stacked = false }: NavItemContentProps) {
  return (
    <>
      <span className={stacked ? "relative w-5 h-5" : "relative w-5 h-5 shrink-0"}>
        {item.icon}
        {item.dotLabel && (
          <span
            aria-hidden="true"
            data-testid="nav-item-dot"
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
          />
        )}
      </span>
      {stacked && <span>{item.label}</span>}
      {!stacked && !collapsed && item.label}
    </>
  );
}
