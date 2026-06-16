import { Outlet, ScrollRestoration } from "react-router-dom";
import { ChefHat, Settings, Shield } from "lucide-react";
import { AppShell, RequireAuth, StepUpModal, Toaster, useIsAuthenticated } from "@platform/ui";
import { buildNav } from "@/constants/nav";
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

export default function RootLayout() {
  const isAuthenticated = useIsAuthenticated();
  const { isSuperuser: _isSuperuser } = useIsSuperuser();
  const { data: currentUser } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });

  const nav = buildNav(ICONS);
  const user = isAuthenticated ? projectUser(currentUser) : ANONYMOUS_USER;

  const logo = (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
        <ChefHat className="w-4 h-4" aria-hidden="true" />
      </div>
      <span className="font-semibold text-sm">MyRecipes</span>
    </div>
  );

  return (
    <RequireAuth>
      <ScrollRestoration />
      <Toaster />
      <StepUpModal />
      <AppShell
        logo={logo}
        nav={nav}
        user={user}
        onSignOut={signOut}
        searchPlaceholder="Search..."
      >
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}
