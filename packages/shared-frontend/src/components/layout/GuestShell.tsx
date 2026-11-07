import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, useLocation, useNavigate, type NavLinkRenderProps } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogIn } from "lucide-react";
import Button from "../ui/Button";
import { cn } from "../../utils/cn";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useScrollTopOnNavigate } from "../../hooks/useScrollTopOnNavigate";
import { readLocalStorage, writeLocalStorage } from "../../lib/safeStorage";
import type { NavItem, NavSection } from "./AppShell";
import NavItemContent from "./NavItemContent";
import { navItemAccessibleLabel } from "../../utils/navItemAccessibleLabel";

export interface GuestShellProps {
  logo: ReactNode;
  /**
   * Icon-only version of the logo shown in the collapsed icon-rail.
   * Falls back to `logo` when omitted.
   */
  logoIcon?: ReactNode;
  /** Nav items visible to unauthenticated visitors (public surfaces only). */
  nav: NavItem[];
  /** Secondary nav groups shown in the desktop sidebar below the main nav. */
  navSections?: NavSection[];
  /**
   * Override the mobile bottom-nav items.  Defaults to `nav` when omitted.
   * Useful when the caller wants to surface a different set of items on mobile
   * (e.g. section-specific items on a nested route).
   */
  bottomNav?: NavItem[];
  /**
   * Optional right-aligned topbar slot — mirrors AppShell's ``headerActions``
   * so the same node (e.g. ``<ThemeToggle />``) can be passed to either shell
   * without conditional plumbing in RootLayout.
   */
  headerActions?: ReactNode;
  /**
   * When true, the "Sign in" CTAs (sidebar + topbar) are hidden entirely.
   * Used by a serve-only / no-auth deployment, where the backend mounts no
   * login route so a Sign-in button would dead-end on a 404. The shell then
   * reads as a plain public site with no account concept.
   */
  hideSignIn?: boolean;
  /**
   * When true, the desktop sidebar gains a collapse toggle that shrinks it
   * to an icon-only rail.  Collapsed state is persisted in localStorage.
   */
  collapsible?: boolean;
  /** Page content. */
  children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = "platform.sidebar.collapsed.v1";

/**
 * GuestShell — app layout for unauthenticated visitors of a public-read /
 * auth-write app.
 *
 * Mirrors the AppShell visually (same sidebar + topbar structure) but:
 *   - Sidebar shows only the public nav items passed in ``nav``.
 *   - User dropdown is replaced with a "Sign in" CTA button.
 *   - Bottom mobile nav reflects the same public-only nav (or ``bottomNav``).
 *
 * Why not extend AppShell directly: AppShell requires a
 * ``user: { name, email? }`` prop and renders a "Sign out" item. Bending its
 * API to handle the guest case would break parity for fully auth-gated apps.
 * A small dedicated component keeps the shared layer clean and lets each app
 * pick the shell in its RootLayout based on auth state.
 */
export default function GuestShell({
  logo,
  logoIcon,
  nav,
  navSections,
  bottomNav,
  headerActions,
  hideSignIn = false,
  collapsible = false,
  children,
}: GuestShellProps) {
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

  function onSignIn() {
    navigate("/login", {
      state: { from: location.pathname + location.search },
    });
  }

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

          {/* Sign-in CTA in the slot AppShell uses for the user dropdown.
              Hidden in serve-only mode (no auth exists). */}
          {!hideSignIn && (
            <div className="border-t p-2">
              <Button
                onClick={onSignIn}
                variant="secondary"
                className={cn(
                  "w-full justify-start gap-2 min-h-[44px]",
                  collapsed && "justify-center"
                )}
                aria-label={collapsed ? "Sign in" : undefined}
              >
                <LogIn className="w-4 h-4 shrink-0" />
                {!collapsed && "Sign in"}
              </Button>
            </div>
          )}
        </aside>
      )}

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 py-3 border-b bg-background shrink-0 h-14">
          <div className="ml-auto flex items-center gap-2">
            {headerActions}
            {!hideSignIn && (
              <Button
                onClick={onSignIn}
                size="sm"
                variant="secondary"
                className="gap-2"
                data-testid="topbar-sign-in"
              >
                <LogIn className="w-4 h-4" />
                Sign in
              </Button>
            )}
          </div>
        </header>

        {/* Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">{children}</main>

        {/* Mobile bottom nav */}
        {isMobile && (
          <nav
            aria-label="Mobile navigation"
            className="flex items-center border-t bg-background shrink-0"
          >
            {mobileItems.slice(0, 5).map((item) => (
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
              >
                <NavItemContent item={item} collapsed={false} stacked />
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
