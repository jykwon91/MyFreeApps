import { useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useSearchParams } from "react-router-dom";
import {
  ClipboardList,
  Coins,
  Gamepad2,
  Hammer,
  Heart,
  LayoutDashboard,
  Lightbulb,
  Map,
  Package,
  PlaySquare,
  Radio,
  Scale,
  Settings,
  Shield,
  Terminal,
  TrendingUp,
  Trophy,
  Utensils,
} from "lucide-react";
import {
  AppShell,
  GuestShell,
  StepUpModal,
  ThemeToggle,
  Toaster,
  useIsAuthenticated,
  type NavItem,
  type NavSection,
} from "@platform/ui";
import { isDiscordActivity } from "@platform/ui/discord-activity";
import DiscordActivityShell from "@/components/discord/DiscordActivityShell";
import { buildNav, PUBLIC_NAV_PATHS } from "@/constants/nav";
import { signOut } from "@/lib/auth";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import { useGetCurrentUserQuery } from "@platform/ui/store/userApi";
import { isTauri } from "@/lib/tauri";
import { isServeOnly } from "@/lib/serveOnly";
import { COMPANION_GAMES, WOW_FOREVER_SLUG } from "@/games/registry";
import type { CurrentUser } from "@platform/ui";

const ANONYMOUS_USER = { name: "You", email: "" };

function projectUser(user: CurrentUser | undefined): { name: string; email: string } {
  if (!user) return ANONYMOUS_USER;
  const trimmedName = user.display_name?.trim() ?? "";
  const localPart = user.email?.split("@")[0]?.trim() ?? "";
  return {
    name: trimmedName || localPart || "You",
    email: user.email ?? "",
  };
}

const ICONS: Record<string, React.ReactNode> = {
  ClipboardList: <ClipboardList className="w-5 h-5" />,
  Gamepad2: <Gamepad2 className="w-5 h-5" />,
  Heart: <Heart className="w-5 h-5" />,
  Package: <Package className="w-5 h-5" />,
  PlaySquare: <PlaySquare className="w-5 h-5" />,
  Radio: <Radio className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
};

/** Icons for WoW Forever section items — keyed by `GameFeature.iconName`. */
const WOW_ICONS: Record<string, React.ReactNode> = {
  Coins: <Coins className="w-5 h-5" />,
  Hammer: <Hammer className="w-5 h-5" />,
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Lightbulb: <Lightbulb className="w-5 h-5" />,
  Map: <Map className="w-5 h-5" />,
  Scale: <Scale className="w-5 h-5" />,
  Terminal: <Terminal className="w-5 h-5" />,
  TrendingUp: <TrendingUp className="w-5 h-5" />,
  Trophy: <Trophy className="w-5 h-5" />,
  Utensils: <Utensils className="w-5 h-5" />,
};

const LOGO = (
  <div className="flex items-center gap-2">
    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-base leading-none">
      <span aria-hidden="true">🎮</span>
    </div>
    <span className="font-semibold text-sm">MyGamingAssistant</span>
  </div>
);

/** Compact icon-only logo for the collapsed sidebar rail. */
const LOGO_ICON = (
  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-base leading-none">
    <span aria-hidden="true">🎮</span>
  </div>
);

/** "Overview" hub item shown at the top of the WoW Forever sidebar section. */
const WOW_OVERVIEW_ITEM: NavItem = {
  path: "/wow-forever",
  label: "Overview",
  icon: <LayoutDashboard className="w-5 h-5" />,
  exact: true,
};

/** Full WoW nav section — displayed in the desktop sidebar on `/wow-forever*` routes. */
function buildWowNavSection(): NavSection {
  const features = COMPANION_GAMES[WOW_FOREVER_SLUG].features;
  return {
    id: "wow-forever",
    title: "WoW Forever",
    routePrefix: "/wow-forever",
    items: [
      WOW_OVERVIEW_ITEM,
      ...features.map((f) => ({
        path: f.path,
        label: f.title,
        icon: WOW_ICONS[f.iconName] ?? <LayoutDashboard className="w-5 h-5" />,
      })),
    ],
  };
}

/**
 * WoW mobile bottom-nav items — shown when the user is on a `/wow-forever*`
 * route on a small screen.  Limited to 5 items (the bottom-nav cap).
 *
 * Ordering: Overview first (has "Back to games" link), then the most-used pages.
 */
function buildWowMobileItems(): NavItem[] {
  const features = COMPANION_GAMES[WOW_FOREVER_SLUG].features;
  const MOBILE_ICONS: readonly string[] = ["Map", "Hammer", "Terminal", "Trophy"];
  return [
    WOW_OVERVIEW_ITEM,
    ...features
      .filter((f) => MOBILE_ICONS.includes(f.iconName))
      .sort((a, b) => MOBILE_ICONS.indexOf(a.iconName) - MOBILE_ICONS.indexOf(b.iconName))
      .map((f) => ({
        path: f.path,
        label: f.title,
        icon: WOW_ICONS[f.iconName] ?? <LayoutDashboard className="w-5 h-5" />,
      })),
  ];
}

const WOW_NAV_SECTION = buildWowNavSection();
const WOW_MOBILE_ITEMS = buildWowMobileItems();

/**
 * RootLayout — top-level layout wrapper.
 *
 * MGA uses a public-read / auth-write model (see apps/mygamingassistant/CLAUDE.md
 * → Authentication Model). The layout reflects that:
 *
 *   - Discord Activity (opened from Discord) → DiscordActivityShell: one slim
 *     bar (Games / theme / Open in browser) and no account UI, ALWAYS — it
 *     wins over every mode below. The Activity is read-only (lib/readOnly.ts).
 *   - Serve-only mode (VITE_SERVE_ONLY) → GuestShell with NO Sign-in CTA and
 *     public nav only, ALWAYS. The production public library has zero auth;
 *     the backend mounts no login route, so no AppShell and no Sign-in
 *     affordance ever appear.
 *   - Compact mode (``?compact=1``)  → strip shell entirely; show only the
 *     game UI. Public — unauthenticated users can use compact mode too if
 *     the inner content is public.
 *   - Authenticated                  → full AppShell with all nav items.
 *   - Unauthenticated (default)      → GuestShell — public nav items only,
 *     "Sign in" CTA where the user dropdown would be.
 *
 * Per-route gating for write surfaces is handled by ``<AuthRequired>`` (see
 * routes.tsx), not at the layout level. That way the layout stays decoupled
 * from individual page auth requirements.
 */
export default function RootLayout() {
  // Serve-only is a compile-time build flag (VITE_SERVE_ONLY) — stable for the
  // life of the bundle, so it's safe to read once at render.
  const serveOnly = isServeOnly();
  const isAuthenticated = useIsAuthenticated();
  const { isSuperuser: _isSuperuser } = useIsSuperuser();
  const { data: currentUser } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Tauri injects `window.__TAURI_INTERNALS__` before the bundle's first
  // script eval, so the check is stable at mount. Capture once.
  const [inTauri] = useState(() => isTauri());
  // Fixed for the page: Discord's launch parameters are read once at startup.
  const [inDiscord] = useState(isDiscordActivity);

  const isCompact = searchParams.get("compact") === "1";
  const isOnWowRoute = location.pathname.startsWith("/wow-forever");

  // Authenticated callers see every nav item; guests (and ALL serve-only
  // visitors) see only the designated public paths so the sidebar doesn't
  // dangle dead links to operator-only pages that don't exist here.
  const showAuthedNav = isAuthenticated && !serveOnly;
  const nav = showAuthedNav
    ? buildNav(ICONS, inTauri)
    : buildNav(ICONS, inTauri).filter((n) => PUBLIC_NAV_PATHS.has(n.path));
  const user = showAuthedNav ? projectUser(currentUser) : ANONYMOUS_USER;

  // Mobile bottom-nav: show WoW items when on a WoW route, main nav otherwise.
  const mobileBottomNav = isOnWowRoute ? WOW_MOBILE_ITEMS : undefined;

  // Discord Activity: the compact Activity frame. Checked first so neither a
  // stale token (AppShell) nor ?compact=1 (bare page, no way home) applies
  // inside Discord.
  if (inDiscord) {
    return (
      <>
        <ScrollRestoration />
        <Toaster />
        <DiscordActivityShell>
          <Outlet />
        </DiscordActivityShell>
      </>
    );
  }

  // Serve-only mode: the public read-only library has zero auth. Render the
  // GuestShell with public nav and NO Sign-in CTA, regardless of any stale
  // auth state. This short-circuits BEFORE the authenticated AppShell branch
  // so an operator token left in storage from a full-auth build can never
  // surface the AppShell here. Compact mode is still honored (it's public).
  if (serveOnly && !isCompact) {
    return (
      <>
        <ScrollRestoration />
        <Toaster />
        <GuestShell
          logo={LOGO}
          logoIcon={LOGO_ICON}
          nav={nav}
          navSections={[WOW_NAV_SECTION]}
          bottomNav={mobileBottomNav}
          collapsible
          headerActions={<ThemeToggle />}
          hideSignIn
        >
          <Outlet />
        </GuestShell>
      </>
    );
  }

  // Compact mode strips the shell entirely so the inner UI fills the viewport
  // (designed for a second-monitor window). Auth is not enforced here — the
  // inner routes use ``<AuthRequired>`` for their own gating.
  if (isCompact) {
    return (
      <>
        <ScrollRestoration />
        <Toaster />
        <StepUpModal />
        <Outlet />
      </>
    );
  }

  // Unauthenticated visitor — guest shell with public nav + sign-in CTA.
  if (!isAuthenticated) {
    return (
      <>
        <ScrollRestoration />
        <Toaster />
        <StepUpModal />
        <GuestShell
          logo={LOGO}
          logoIcon={LOGO_ICON}
          nav={nav}
          navSections={[WOW_NAV_SECTION]}
          bottomNav={mobileBottomNav}
          collapsible
          headerActions={<ThemeToggle />}
        >
          <Outlet />
        </GuestShell>
      </>
    );
  }

  // Authenticated — standard AppShell from @platform/ui.
  return (
    <>
      <ScrollRestoration />
      <Toaster />
      <StepUpModal />
      <AppShell
        logo={LOGO}
        logoIcon={LOGO_ICON}
        nav={nav}
        navSections={[WOW_NAV_SECTION]}
        bottomNav={mobileBottomNav}
        collapsible
        user={user}
        onSignOut={signOut}
        searchPlaceholder="Search lineups..."
        headerActions={<ThemeToggle />}
      >
        <Outlet />
      </AppShell>
    </>
  );
}
