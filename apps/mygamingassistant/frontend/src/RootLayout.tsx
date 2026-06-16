import { useState } from "react";
import { Outlet, ScrollRestoration, useSearchParams } from "react-router-dom";
import {
  ClipboardList,
  Gamepad2,
  Heart,
  Package,
  PlaySquare,
  Radio,
  Settings,
  Shield,
} from "lucide-react";
import { AppShell, StepUpModal, ThemeToggle, Toaster, useIsAuthenticated } from "@platform/ui";
import { buildNav, PUBLIC_NAV_PATHS } from "@/constants/nav";
import { signOut } from "@/lib/auth";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import { useGetCurrentUserQuery } from "@/lib/userApi";
import { isTauri } from "@/lib/tauri";
import { isServeOnly } from "@/lib/serveOnly";
import GuestShell from "@/components/auth/GuestShell";
import type { CurrentUser } from "@/lib/userApi";

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

const LOGO = (
  <div className="flex items-center gap-2">
    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-base leading-none">
      <span aria-hidden="true">🎮</span>
    </div>
    <span className="font-semibold text-sm">MyGamingAssistant</span>
  </div>
);

/**
 * RootLayout — top-level layout wrapper.
 *
 * MGA uses a public-read / auth-write model (see apps/mygamingassistant/CLAUDE.md
 * → Authentication Model). The layout reflects that:
 *
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
  // Tauri injects `window.__TAURI_INTERNALS__` before the bundle's first
  // script eval, so the check is stable at mount. Capture once.
  const [inTauri] = useState(() => isTauri());

  const isCompact = searchParams.get("compact") === "1";

  // Authenticated callers see every nav item; guests (and ALL serve-only
  // visitors) see only the designated public paths so the sidebar doesn't
  // dangle dead links to operator-only pages that don't exist here.
  const showAuthedNav = isAuthenticated && !serveOnly;
  const nav = showAuthedNav
    ? buildNav(ICONS, inTauri)
    : buildNav(ICONS, inTauri).filter((n) => PUBLIC_NAV_PATHS.has(n.path));
  const user = showAuthedNav ? projectUser(currentUser) : ANONYMOUS_USER;

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
        <GuestShell logo={LOGO} nav={nav} headerActions={<ThemeToggle />} hideSignIn>
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
        <GuestShell logo={LOGO} nav={nav} headerActions={<ThemeToggle />}>
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
        nav={nav}
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
