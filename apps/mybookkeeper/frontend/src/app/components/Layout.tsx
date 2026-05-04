import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageErrorBoundary from "@/shared/components/PageErrorBoundary";
import { ChevronDown, ChevronRight, Menu, Settings, X, LogOut, ChevronUp } from "lucide-react";
import { logout } from "@/shared/lib/auth";
import { cn } from "@/shared/utils/cn";
import { NAV_GROUPS } from "@/app/lib/nav";
import type { NavItem } from "@/shared/lib/constants";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import ThemeToggle from "@/shared/components/ThemeToggle";
import OrgSwitcher from "@/app/features/organizations/OrgSwitcher";
import VersionTag from "@/app/components/VersionTag";
import DemoWelcomeDialog from "@/app/components/DemoWelcomeDialog";
import GmailReauthSidebarBanner from "@/app/components/GmailReauthSidebarBanner";
import LegalFooter from "@/app/components/LegalFooter";
import { useGetAttributionReviewQueueQuery } from "@/shared/store/attributionApi";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Poll attribution queue count every 2 min to keep the badge fresh.
  const { data: attributionQueueData } = useGetAttributionReviewQueueQuery(
    { limit: 1, offset: 0 },
    { pollingInterval: 120_000 },
  );
  const attributionPendingCount = attributionQueueData?.pending_count ?? 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);
  const { user } = useCurrentUser();
  const isOrgAdmin = useIsOrgAdmin();
  const isAdmin = user?.role === "admin";

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
      isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
    );

  const itemAllowed = (item: NavItem): boolean => {
    if (item.roles && (!user || !item.roles.includes(user.role))) return false;
    if (item.orgAdmin && !isOrgAdmin) return false;
    return true;
  };

  const filteredGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(itemAllowed) }))
    .filter((g) => g.items.length > 0);

  // Persist collapsed-group state per-user. Default: all groups expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("nav.collapsedGroups");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("nav.collapsedGroups", JSON.stringify(collapsedGroups));
    } catch {
      // localStorage unavailable (private mode, quota) — silently no-op
    }
  }, [collapsedGroups]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="min-h-screen flex md:h-screen md:overflow-hidden">
      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-card border-b z-30 flex items-center px-4 md:hidden">
        <button onClick={() => setSidebarOpen(true)} className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <span className="font-semibold text-sm ml-3">MyBookkeeper</span>
      </header>

      {/* Sidebar backdrop (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-dvh w-56 bg-card border-r flex flex-col z-50 transition-transform duration-200",
          "md:static md:h-screen md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-4 py-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-lg">MyBookkeeper</span>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1" aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <OrgSwitcher />
        </div>
        <GmailReauthSidebarBanner />
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-4">
          {filteredGroups.map((group, idx) => {
            const isCollapsed = group.label ? collapsedGroups[group.label] : false;
            return (
              <div key={group.label ?? `group-${idx}`} className="space-y-1">
                {group.label ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label!)}
                    className="w-full flex items-center justify-between px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors min-h-[28px]"
                    aria-expanded={!isCollapsed}
                    data-testid={`nav-group-toggle-${group.label}`}
                  >
                    <span>{group.label}</span>
                    {isCollapsed ? (
                      <ChevronRight size={12} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={12} aria-hidden="true" />
                    )}
                  </button>
                ) : null}
                {!isCollapsed
                  ? group.items.map(({ to, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === "/"}
                        onClick={() => setSidebarOpen(false)}
                        className={navLinkClass}
                      >
                        <span className="flex-1">{label}</span>
                        {to === "/payment-review" && attributionPendingCount > 0 && (
                          <span
                            className="ml-auto shrink-0 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-semibold min-w-[18px] h-[18px] px-1"
                            aria-label={`${attributionPendingCount} pending payment reviews`}
                          >
                            {attributionPendingCount > 99 ? "99+" : attributionPendingCount}
                          </span>
                        )}
                      </NavLink>
                    ))
                  : null}
              </div>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t space-y-2">
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((p) => !p)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                    {(user.name ?? user.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="text-xs font-medium truncate">{user.name ?? user.email.split("@")[0]}</div>
                    <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
                  </div>
                </div>
                <ChevronUp size={14} className={cn("text-muted-foreground transition-transform", !menuOpen && "rotate-180")} />
              </button>
              {menuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border rounded-md shadow-lg py-1">
                  {isAdmin && (
                    <NavLink
                      to="/admin"
                      onClick={() => { setSidebarOpen(false); setMenuOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                    >
                      <Settings size={14} />
                      Admin
                    </NavLink>
                  )}
                  <button
                    onClick={() => {
                      setIsLoggingOut(true);
                      setMenuOpen(false);
                      try { logout(); } catch { setIsLoggingOut(false); }
                    }}
                    disabled={isLoggingOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <LogOut size={14} />
                    {isLoggingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          )}
          <VersionTag />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0 md:overflow-auto flex flex-col">
        <PageErrorBoundary>
          <div className="flex-1">
            <Outlet />
          </div>
        </PageErrorBoundary>
        <LegalFooter />
      </main>

      <DemoWelcomeDialog />
    </div>
  );
}
