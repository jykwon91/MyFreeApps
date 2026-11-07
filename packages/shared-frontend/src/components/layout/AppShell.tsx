import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, useNavigate, useLocation, type NavLinkRenderProps } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { cn } from "../../utils/cn";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useScrollTopOnNavigate } from "../../hooks/useScrollTopOnNavigate";
import { readLocalStorage, writeLocalStorage } from "../../lib/safeStorage";
import UserAvatar, { type UserAvatarUser } from "./UserAvatar";
import SearchBar from "./SearchBar";
import NavItemContent from "./NavItemContent";
import { navItemAccessibleLabel } from "../../utils/navItemAccessibleLabel";

export type NavItem = {
  path: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  /**
   * When set, a small dot marks the item (e.g. "this page has something new") and
   * this text is read out after the label. Off by default.
   */
  dotLabel?: string;
};

/**
 * A secondary nav group that appears in the sidebar below the main nav.
 * Visible only when the current path starts with `routePrefix` (if set).
 */
export type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
  /** When set, the section is only shown while the pathname starts with this prefix. */
  routePrefix?: string;
};

export type BottomNavItem =
  | NavItem
  | { kind: "fab"; label: string; icon: ReactNode; onClick: () => void };

export interface AppShellProps {
  logo: ReactNode;
  /**
   * Icon-only version of the logo shown in the collapsed icon-rail.
   * Falls back to `logo` when omitted.
   */
  logoIcon?: ReactNode;
  nav: NavItem[];
  /** Secondary nav groups shown in the desktop sidebar below the main nav. */
  navSections?: NavSection[];
  bottomNav?: BottomNavItem[];
  /**
   * When true, the desktop sidebar gains a collapse toggle that shrinks it
   * to an icon-only rail.  Collapsed state is persisted in localStorage.
   */
  collapsible?: boolean;
  user: UserAvatarUser;
  onSignOut: () => void;
  headerTitle?: string;
  headerActions?: ReactNode;
  searchPlaceholder?: string;
  onSearchSubmit?: (q: string) => void;
  children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = "platform.sidebar.collapsed.v1";

function isFab(
  item: BottomNavItem
): item is { kind: "fab"; label: string; icon: ReactNode; onClick: () => void } {
  return "kind" in item && item.kind === "fab";
}

export default function AppShell({
  logo,
  logoIcon,
  nav,
  navSections,
  bottomNav,
  collapsible = false,
  user,
  onSignOut,
  headerTitle,
  headerActions,
  searchPlaceholder = "What are you looking for today?",
  onSearchSubmit,
  children,
}: AppShellProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useScrollTopOnNavigate<HTMLElement>();
  const mobileItems = bottomNav ?? nav;

  const [collapsed, setCollapsed] = useState(() =>
    collapsible ? readLocalStorage(SIDEBAR_COLLAPSED_KEY) === "true" : false
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writeLocalStorage(SIDEBAR_COLLAPSED_KEY, next ? "true" : "false");
  }

  const activeSections =
    navSections?.filter(
      (s) => !s.routePrefix || location.pathname.startsWith(s.routePrefix)
    ) ?? [];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — desktop only */}
      {!isMobile && (
        <aside
          id="main-sidebar"
          className={cn(
            "flex flex-col border-r bg-background shrink-0 transition-[width] duration-200",
            collapsed ? "w-16" : "w-60"
          )}
        >
          {/* Logo */}
          <button
            onClick={() => navigate("/")}
            className={cn(
              "flex items-center gap-2 px-4 py-4 hover:opacity-80 transition-opacity text-left",
              collapsed && "justify-center px-0"
            )}
            aria-label="Go to home"
          >
            {collapsed ? (logoIcon ?? logo) : logo}
          </button>

          {/* Nav + Sections — scrollable */}
          <div className="flex-1 overflow-y-auto">
            <nav aria-label="Main navigation" className="px-2 py-2 space-y-0.5">
              {nav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  title={collapsed ? navItemAccessibleLabel(item, true) : undefined}
                  className={({ isActive }: NavLinkRenderProps) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px]",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )
                  }
                  aria-label={navItemAccessibleLabel(item, collapsed)}
                  aria-current={
                    location.pathname === item.path ||
                    (!item.exact && location.pathname.startsWith(item.path))
                      ? "page"
                      : undefined
                  }
                >
                  <NavItemContent item={item} collapsed={collapsed} />
                </NavLink>
              ))}
            </nav>

            {activeSections.map((section) => (
              <div key={section.id} className="px-2 py-1">
                {!collapsed && (
                  <div
                    className="text-xs font-medium text-muted-foreground px-3 py-1.5 uppercase tracking-wide"
                    aria-label={section.title}
                  >
                    {section.title}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.exact}
                      title={collapsed ? navItemAccessibleLabel(item, true) : undefined}
                      className={({ isActive }: NavLinkRenderProps) =>
                        cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px]",
                          collapsed && "justify-center px-0",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )
                      }
                      aria-label={navItemAccessibleLabel(item, collapsed)}
                      aria-current={
                        location.pathname === item.path ||
                        (!item.exact && location.pathname.startsWith(item.path))
                          ? "page"
                          : undefined
                      }
                    >
                      <NavItemContent item={item} collapsed={collapsed} />
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Collapse toggle */}
          {collapsible && (
            <div className={cn("border-t p-2 flex", collapsed ? "justify-center" : "justify-end")}>
              <button
                onClick={toggleCollapsed}
                className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                aria-controls="main-sidebar"
              >
                {collapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            </div>
          )}

          {/* User menu */}
          <div className="border-t p-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors min-h-[44px]",
                    collapsed && "justify-center px-0"
                  )}
                  aria-label={collapsed ? user.name : undefined}
                >
                  <UserAvatar user={user} />
                  {!collapsed && (
                    <>
                      <div className="flex-1 text-left min-w-0">
                        <div className="font-medium truncate">{user.name}</div>
                        {user.email && (
                          <div className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </div>
                        )}
                      </div>
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="top"
                  align="start"
                  className="z-50 min-w-[180px] rounded-md border bg-background shadow-md p-1 text-sm"
                  sideOffset={4}
                >
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-muted text-destructive outline-none min-h-[44px]"
                    onSelect={onSignOut}
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </aside>
      )}

      {/* Main column. ``min-h-0`` is required so the inner ``main``'s
          ``overflow-y-auto`` constrains to the allocated flex height
          rather than the min-content of its descendants. Without it,
          some browsers let the column grow past the viewport, which
          surfaces as a scroll-bar that runs past the actual content. */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 py-3 border-b bg-background shrink-0 h-14">
          {headerTitle && (
            <h1 className="text-base font-semibold truncate">{headerTitle}</h1>
          )}
          <SearchBar
            placeholder={searchPlaceholder}
            onSearchSubmit={onSearchSubmit}
          />
          <div className="ml-auto flex items-center gap-2">{headerActions}</div>
        </header>

        {/* Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">{children}</main>

        {/* Mobile bottom nav */}
        {isMobile && (
          <nav
            aria-label="Mobile navigation"
            className="flex items-center border-t bg-background shrink-0"
          >
            {mobileItems.slice(0, 5).map((item, idx) => {
              if (isFab(item)) {
                return (
                  <div key={idx} className="flex-1 flex justify-center -translate-y-4">
                    <button
                      onClick={item.onClick}
                      aria-label={item.label}
                      className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
                    >
                      {item.icon}
                    </button>
                  </div>
                );
              }
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  className={({ isActive }: NavLinkRenderProps) =>
                    cn(
                      "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs transition-colors min-h-[56px]",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )
                  }
                  aria-label={navItemAccessibleLabel(item, false)}
                  aria-current={
                    location.pathname === item.path ? "page" : undefined
                  }
                >
                  <NavItemContent item={item} collapsed={false} stacked />
                </NavLink>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
