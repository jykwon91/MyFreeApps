import { Outlet, ScrollRestoration, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  UserCircle,
  Settings,
  Plus,
} from "lucide-react";
import { AppShell, RequireAuth, Toaster, useIsAuthenticated } from "@platform/ui";
import { buildNav, buildBottomNav } from "@/constants/nav";
import { signOut } from "@/lib/auth";

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
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Briefcase: <Briefcase className="w-5 h-5" />,
  Building2: <Building2 className="w-5 h-5" />,
  UserCircle: <UserCircle className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
  Plus: <Plus className="w-5 h-5" />,
};

const nav = buildNav(ICONS);

export default function RootLayout() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();

  const bottomNav = buildBottomNav(ICONS, () => {
    // Phase 2 will open the Add Application dialog
    // For Phase 1, navigate to applications page
    navigate("/applications");
  });

  const user = isAuthenticated ? getUserFromToken() : { name: "You", email: "" };

  const logo = (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
        <span className="text-primary-foreground font-bold text-sm">J</span>
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
      >
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}
