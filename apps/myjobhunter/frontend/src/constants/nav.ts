import type { ReactNode } from "react";
import type { NavItem, BottomNavItem } from "@platform/ui";

// Icon nodes are created at runtime in App.tsx and passed in via constants helpers.
// This module exports typed descriptors — icons are injected at component level
// so this file stays free of JSX and React imports.

export interface NavDescriptor {
  path: string;
  label: string;
  iconName: string;
  exact?: boolean;
}

export const NAV_DESCRIPTORS: NavDescriptor[] = [
  { path: "/dashboard", label: "Dashboard", iconName: "LayoutDashboard" },
  { path: "/applications", label: "Applications", iconName: "Briefcase" },
  { path: "/companies", label: "Companies", iconName: "Building2" },
  { path: "/profile", label: "Profile", iconName: "UserCircle" },
  { path: "/settings", label: "Settings", iconName: "Settings" },
];

/** Build the full NavItem array — called once in App.tsx with injected icon nodes. */
export function buildNav(icons: Record<string, ReactNode>): NavItem[] {
  return NAV_DESCRIPTORS.map(({ path, label, iconName, exact }) => ({
    path,
    label,
    icon: icons[iconName],
    exact,
  }));
}

/** Build mobile bottom nav with a center FAB slot. */
export function buildBottomNav(
  icons: Record<string, ReactNode>,
  onFabClick: () => void
): BottomNavItem[] {
  return [
    { path: "/dashboard", label: "Dashboard", icon: icons["LayoutDashboard"] },
    { path: "/applications", label: "Applications", icon: icons["Briefcase"] },
    {
      kind: "fab" as const,
      label: "Add application",
      icon: icons["Plus"],
      onClick: onFabClick,
    },
    { path: "/profile", label: "Profile", icon: icons["UserCircle"] },
    { path: "/settings", label: "Settings", icon: icons["Settings"] },
  ];
}
