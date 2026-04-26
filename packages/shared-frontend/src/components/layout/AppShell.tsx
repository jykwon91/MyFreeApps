import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, useNavigate, useLocation, type NavLinkRenderProps } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Search, LogOut, ChevronDown } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";

export type NavItem = {
  path: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
};

export type BottomNavItem =
  | NavItem
  | { kind: "fab"; label: string; icon: ReactNode; onClick: () => void };

export interface AppShellProps {
  logo: ReactNode;
  nav: NavItem[];
  bottomNav?: BottomNavItem[];
  user: { name: string; email?: string; avatarUrl?: string };
  onSignOut: () => void;
  headerTitle?: string;
  headerActions?: ReactNode;
  searchPlaceholder?: string;
  onSearchSubmit?: (q: string) => void;
  children: ReactNode;
}

function isFab(
  item: BottomNavItem
): item is { kind: "fab"; label: string; icon: ReactNode; onClick: () => void } {
  return "kind" in item && item.kind === "fab";
}

function UserAvatar({ user }: { user: AppShellProps["user"] }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
      {initials}
    </div>
  );
}

function SearchBar({
  placeholder,
  onSearchSubmit,
}: {
  placeholder: string;
  onSearchSubmit?: (q: string) => void;
}) {
  const [value, setValue] = useState("");
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSearchSubmit?.(value);
  }

  return (
    <form onSubmit={handleSubmit} className="relative hidden sm:flex items-center">
      <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-14 py-1.5 text-sm rounded-md border bg-background w-64 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <kbd className="absolute right-3 text-xs text-muted-foreground font-mono pointer-events-none">
        {isMac ? "⌘K" : "Ctrl+K"}
      </kbd>
    </form>
  );
}

export default function AppShell({
  logo,
  nav,
  bottomNav,
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
  const mobileItems = bottomNav ?? nav;

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
                aria-current={
                  location.pathname === item.path ||
                  (!item.exact && location.pathname.startsWith(item.path))
                    ? "page"
                    : undefined
                }
              >
                <span className="w-5 h-5 shrink-0">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User menu */}
          <div className="border-t p-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors min-h-[44px]">
                  <UserAvatar user={user} />
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    {user.email && (
                      <div className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </div>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
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

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
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
        <main className="flex-1 overflow-y-auto">{children}</main>

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
                  aria-current={
                    location.pathname === item.path ? "page" : undefined
                  }
                >
                  <span className="w-5 h-5">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
