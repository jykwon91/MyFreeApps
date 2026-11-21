import { NavLink, Outlet } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { ADMIN_NAV } from "@/admin/lib/nav";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { useGetHealthSummaryQuery } from "@/shared/store/healthApi";
import { ThemeToggle } from "@platform/ui";
import ResponsiveSidebar from "@/shared/components/ResponsiveSidebar";
import SidebarUserMenu from "@/shared/components/SidebarUserMenu";
import VersionTag from "@/app/components/VersionTag";

export default function AdminLayout() {
  const { user } = useCurrentUser();
  const { data: healthSummary } = useGetHealthSummaryQuery(undefined, {
    pollingInterval: 30000,
    skipPollingIfUnfocused: true,
  });

  return (
    <div className="min-h-screen flex md:h-screen md:overflow-hidden">
      <ResponsiveSidebar
        title="Admin"
        header={
          <NavLink
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Back to app
          </NavLink>
        }
      >
        {(closeDrawer) => (
          <>
            <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">
              {ADMIN_NAV.map(({ to, label }) => {
                const healthStatus = healthSummary?.status;
                const showDot = to === "/admin/system-health" && healthStatus && healthStatus !== "healthy";
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/admin"}
                    onClick={closeDrawer}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )
                    }
                  >
                    {label}
                    {showDot ? (
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          healthStatus === "unhealthy" ? "bg-red-500" : "bg-yellow-500",
                        )}
                      />
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
            <div className="px-3 py-3 border-t space-y-2">
              <div className="flex justify-center">
                <ThemeToggle />
              </div>
              {user && <SidebarUserMenu user={user} showAdminLink={false} onNavigate={closeDrawer} />}
              <VersionTag />
            </div>
          </>
        )}
      </ResponsiveSidebar>

      <main className="flex-1 min-w-0 pt-14 md:pt-0 md:overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
