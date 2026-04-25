import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageErrorBoundary from "@/shared/components/PageErrorBoundary";
import { Menu, Settings, X, LogOut, ChevronUp } from "lucide-react";
import { logout } from "@/shared/lib/auth";
import { cn } from "@/shared/utils/cn";
import { NAV } from "@/app/lib/nav";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import ThemeToggle from "@/shared/components/ThemeToggle";
import OrgSwitcher from "@/app/features/organizations/OrgSwitcher";
import VersionTag from "@/app/components/VersionTag";
import DemoWelcomeDialog from "@/app/components/DemoWelcomeDialog";
import LegalFooter from "@/app/components/LegalFooter";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const filteredNav = NAV.filter(
    (item) => {
      if (item.roles && (!user || !item.roles.includes(user.role))) return false;
      if (item.orgAdmin && !isOrgAdmin) return false;
      return true;
    },
  );

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
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">
          {filteredNav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={navLinkClass}
            >
              {label}
            </NavLink>
          ))}
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
