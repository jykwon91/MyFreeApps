import { Outlet, ScrollRestoration, useNavigate } from "react-router-dom";
import {
  Briefcase,
  Building2,
  FileText,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  UserCircle,
} from "lucide-react";
import { AppShell, RequireAuth, Toaster, useIsAuthenticated } from "@platform/ui";
import { buildNav, buildBottomNav } from "@/constants/nav";
import { signOut } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import { useGetCurrentUserQuery } from "@/lib/userApi";
import type { CurrentUser } from "@/lib/userApi";

const ANONYMOUS_USER = { name: "You", email: "" };

/**
 * Project the authenticated user's profile into the
 * ``{ name, email }`` shape the shared AppShell expects.
 *
 * fastapi-users JWTs do not carry name / email claims by default —
 * the previous implementation decoded the JWT and always fell back
 * to the literal "You", which is what the operator was seeing in
 * the sidebar. ``GET /users/me`` is the canonical source of the
 * display name + email, so use that.
 *
 * Fallback chain mirrors what AppShell's UserAvatar already does
 * for the avatar initial: prefer display_name, then email
 * local-part, then literal "You".
 */
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
  Briefcase: <Briefcase className="w-5 h-5" />,
  Building2: <Building2 className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Plus: <Plus className="w-5 h-5" />,
  Search: <Search className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Sparkles: <Sparkles className="w-5 h-5" />,
  UserCircle: <UserCircle className="w-5 h-5" />,
};

export default function RootLayout() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const { isSuperuser } = useIsSuperuser();
  const { data: currentUser } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthenticated,
  });

  const nav = buildNav(ICONS, { includeAdmin: isSuperuser });
  const bottomNav = buildBottomNav(ICONS, () => {
    // Phase 2 will open the Add Application dialog
    // For Phase 1, navigate to applications page
    navigate("/applications");
  });

  const user = isAuthenticated ? projectUser(currentUser) : ANONYMOUS_USER;

  // Matches the favicon (briefcase emoji from index.html) so the
  // brand mark is consistent everywhere it shows. The previous
  // text-based "J" tile read like a dev placeholder.
  const logo = (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-base leading-none">
        <span aria-hidden="true">💼</span>
      </div>
      <span className="font-semibold text-sm">MyJobHunter</span>
    </div>
  );

  return (
    <RequireAuth>
      <ScrollRestoration />
      <Toaster />
      <AppShell
        logo={logo}
        nav={nav}
        bottomNav={bottomNav}
        user={user}
        onSignOut={signOut}
        searchPlaceholder="Search applications, companies..."
        headerActions={<ThemeToggle />}
      >
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}
