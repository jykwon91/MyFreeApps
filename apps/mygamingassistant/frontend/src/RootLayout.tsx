import { Outlet, ScrollRestoration, useSearchParams } from "react-router-dom";
import {
  ClipboardList,
  Gamepad2,
  Package,
  PlaySquare,
  Settings,
  Shield,
} from "lucide-react";
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
  ClipboardList: <ClipboardList className="w-5 h-5" />,
  Gamepad2: <Gamepad2 className="w-5 h-5" />,
  Package: <Package className="w-5 h-5" />,
  PlaySquare: <PlaySquare className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
};

export default function RootLayout() {
  const isAuthenticated = useIsAuthenticated();
  const { isSuperuser: _isSuperuser } = useIsSuperuser();
  const { data: currentUser } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });
  const [searchParams] = useSearchParams();

  const isCompact = searchParams.get("compact") === "1";

  const nav = buildNav(ICONS);
  const user = isAuthenticated ? projectUser(currentUser) : ANONYMOUS_USER;

  const logo = (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-base leading-none">
        <span aria-hidden="true">🎮</span>
      </div>
      <span className="font-semibold text-sm">MyGamingAssistant</span>
    </div>
  );

  // Compact mode: strip away the app shell header/sidebar so the game UI
  // fills the full viewport (designed for a second-monitor window).
  if (isCompact) {
    return (
      <RequireAuth>
        <ScrollRestoration />
        <Toaster />
        <StepUpModal />
        <Outlet />
      </RequireAuth>
    );
  }

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
        searchPlaceholder="Search lineups..."
      >
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}
