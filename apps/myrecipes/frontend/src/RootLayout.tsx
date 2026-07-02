import { Outlet, ScrollRestoration } from "react-router-dom";
import { ChefHat, Settings, Shield } from "lucide-react";
import { AppShell, GuestShell, StepUpModal, Toaster, useIsAuthenticated } from "@platform/ui";
import { buildNav, PUBLIC_NAV_PATHS } from "@/constants/nav";
import { signOut } from "@/lib/auth";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import { useGetCurrentUserQuery } from "@/lib/userApi";
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
  Recipes: <ChefHat className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
};

const LOGO = (
  <div className="flex items-center gap-2">
    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
      <ChefHat className="w-4 h-4" aria-hidden="true" />
    </div>
    <span className="font-semibold text-sm">MyRecipes</span>
  </div>
);

/**
 * RootLayout — top-level layout wrapper.
 *
 * MyRecipes uses a public-read / auth-write model: the recipe library is
 * publicly browsable, and only writes (create / tweak / cook / account pages)
 * require an account. The layout reflects that:
 *
 *   - Authenticated             → full AppShell with all nav items.
 *   - Unauthenticated (default) → GuestShell — public nav items only, with a
 *     "Sign in" CTA where the user dropdown would be. The CTA carries the
 *     current pathname via ``state.from`` so Login can return the visitor here
 *     after they sign in.
 *
 * Per-route gating for write surfaces is handled by ``<AuthRequired>`` (see
 * routes.tsx), not at the layout level, so the layout stays decoupled from
 * individual page auth requirements.
 */
export default function RootLayout() {
  const isAuthenticated = useIsAuthenticated();
  const { isSuperuser: _isSuperuser } = useIsSuperuser();
  const { data: currentUser } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });

  // Guests see only the public paths so the sidebar doesn't dangle dead links
  // to pages that require an account.
  const fullNav = buildNav(ICONS);
  const nav = isAuthenticated
    ? fullNav
    : fullNav.filter((n) => PUBLIC_NAV_PATHS.has(n.path));
  const user = isAuthenticated ? projectUser(currentUser) : ANONYMOUS_USER;

  if (!isAuthenticated) {
    return (
      <>
        <ScrollRestoration />
        <Toaster />
        <StepUpModal />
        <GuestShell logo={LOGO} nav={nav}>
          <Outlet />
        </GuestShell>
      </>
    );
  }

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
        searchPlaceholder="Search..."
      >
        <Outlet />
      </AppShell>
    </>
  );
}
