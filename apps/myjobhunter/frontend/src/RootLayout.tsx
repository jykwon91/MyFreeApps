import { Outlet, ScrollRestoration, useNavigate } from "react-router-dom";
import {
  Briefcase,
  Building2,
  FileText,
  LayoutDashboard,
  Plus,
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

// Decode basic user info from JWT for display in the shell's user menu.
// This is display-only — no security decisions are made from client-side decode.
function getUserFromToken(): { name: string; email: string } {
  try {
    const token = localStorage.getItem("token");
    if (!token) return { name: "You", email: "" };
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      name: payload.name ?? payload.email?.split("@")[0] ?? "You",
      email: payload.email ?? "",
    };
  } catch {
    return { name: "You", email: "" };
  }
}

const ICONS: Record<string, React.ReactNode> = {
  Briefcase: <Briefcase className="w-5 h-5" />,
  Building2: <Building2 className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Plus: <Plus className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Sparkles: <Sparkles className="w-5 h-5" />,
  UserCircle: <UserCircle className="w-5 h-5" />,
};

export default function RootLayout() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const { isSuperuser } = useIsSuperuser();

  const nav = buildNav(ICONS, { includeAdmin: isSuperuser });
  const bottomNav = buildBottomNav(ICONS, () => {
    // Phase 2 will open the Add Application dialog
    // For Phase 1, navigate to applications page
    navigate("/applications");
  });

  const user = isAuthenticated ? getUserFromToken() : { name: "You", email: "" };

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
