import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate, type NavLinkRenderProps } from "react-router-dom";
import { LogIn } from "lucide-react";
import Button from "../ui/Button";
import { cn } from "../../utils/cn";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { NavItem } from "./AppShell";

export interface GuestShellProps {
  logo: ReactNode;
  /** Nav items visible to unauthenticated visitors (public surfaces only). */
  nav: NavItem[];
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
  /** Page content. */
  children: ReactNode;
}

/**
 * GuestShell — app layout for unauthenticated visitors of a public-read /
 * auth-write app.
 *
 * Mirrors the AppShell visually (same sidebar + topbar structure) but:
 *   - Sidebar shows only the public nav items passed in ``nav``.
 *   - User dropdown is replaced with a "Sign in" CTA button.
 *   - Bottom mobile nav reflects the same public-only nav.
 *
 * Why not extend AppShell directly: AppShell requires a
 * ``user: { name, email? }`` prop and renders a "Sign out" item. Bending its
 * API to handle the guest case would break parity for fully auth-gated apps.
 * A small dedicated component keeps the shared layer clean and lets each app
 * pick the shell in its RootLayout based on auth state.
 */
export default function GuestShell({
  logo,
  nav,
  headerActions,
  hideSignIn = false,
  children,
}: GuestShellProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const navigate = useNavigate();
  const location = useLocation();

  function onSignIn() {
    navigate("/login", {
      state: { from: location.pathname + location.search },
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — desktop only */}
      {!isMobile && (
        <aside className="w-60 flex flex-col border-r bg-background shrink-0">
          {/* Logo */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-4 py-4 hover:opacity-80 transition-opacity text-left"
            aria-label="Go to home"
          >
            {logo}
          </button>

          {/* Nav */}
          <nav aria-label="Main navigation" className="flex-1 px-2 py-2 space-y-0.5">
            {nav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }: NavLinkRenderProps) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px]",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <span className="w-5 h-5 shrink-0">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Sign-in CTA in the slot AppShell uses for the user dropdown.
              Hidden in serve-only mode (no auth exists). */}
          {!hideSignIn && (
            <div className="border-t p-2">
              <Button
                onClick={onSignIn}
                variant="secondary"
                className="w-full justify-start gap-2 min-h-[44px]"
              >
                <LogIn className="w-4 h-4" />
                Sign in
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
        <main className="flex-1 overflow-y-auto">{children}</main>

        {/* Mobile bottom nav */}
        {isMobile && (
          <nav
            aria-label="Mobile navigation"
            className="flex items-center border-t bg-background shrink-0"
          >
            {nav.slice(0, 5).map((item) => (
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
              >
                <span className="w-5 h-5">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
