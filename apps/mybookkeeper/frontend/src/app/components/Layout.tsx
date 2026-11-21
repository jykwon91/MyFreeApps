import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageErrorBoundary from "@/shared/components/PageErrorBoundary";
import ResponsiveSidebar from "@/shared/components/ResponsiveSidebar";
import SidebarUserMenu from "@/shared/components/SidebarUserMenu";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { NAV_GROUPS } from "@/app/lib/nav";
import type { NavItem } from "@/shared/lib/constants";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import { MAIN_CONTENT_ID, SkipLink, ThemeToggle } from "@platform/ui";
import OrgSwitcher from "@/app/features/organizations/OrgSwitcher";
import VersionTag from "@/app/components/VersionTag";
import DemoWelcomeDialog from "@/app/components/DemoWelcomeDialog";
import GmailReauthSidebarBanner from "@/app/components/GmailReauthSidebarBanner";
import LegalFooter from "@/app/components/LegalFooter";
import { useGetAttributionReviewQueueQuery } from "@mybookkeeper/api-client/store/attributionApi";
import { useGmailSyncWatcher } from "@/shared/hooks/useGmailSyncWatcher";

export default function Layout() {
  // Keep transaction-derived caches fresh when a background Gmail extraction
  // finishes while the user is on some other page.
  useGmailSyncWatcher();

  // Poll attribution queue count every 2 min to keep the badge fresh.
  const { data: attributionQueueData } = useGetAttributionReviewQueueQuery(
    { limit: 1, offset: 0 },
    { pollingInterval: 120_000, skipPollingIfUnfocused: true },
  );
  const attributionPendingCount = attributionQueueData?.pending_count ?? 0;

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
      <SkipLink />
      <ResponsiveSidebar title="MyBookkeeper" header={<OrgSwitcher />}>
        {(closeDrawer) => (
          <>
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
                            onClick={closeDrawer}
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
              {user && <SidebarUserMenu user={user} showAdminLink={isAdmin} onNavigate={closeDrawer} />}
              <VersionTag />
            </div>
          </>
        )}
      </ResponsiveSidebar>

      {/* Main content */}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 min-w-0 pt-14 md:pt-0 md:overflow-auto focus:outline-none flex flex-col">
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
