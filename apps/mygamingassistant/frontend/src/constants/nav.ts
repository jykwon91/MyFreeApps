import type { ReactNode } from "react";
import type { NavItem } from "@platform/ui";

// Icon nodes are created at runtime in RootLayout.tsx and passed in via buildNav.
// This module exports typed descriptors — icons are injected at component level
// so this file stays free of JSX and React imports.

interface NavDescriptor {
  path: string;
  label: string;
  iconName: string;
  exact?: boolean;
}

const NAV_DESCRIPTORS: NavDescriptor[] = [
  { path: "/", label: "Games", iconName: "Gamepad2", exact: true },
  { path: "/packages", label: "Packages", iconName: "Package" },
  { path: "/sources", label: "Sources", iconName: "PlaySquare" },
  { path: "/review", label: "Review", iconName: "ClipboardList" },
  { path: "/settings", label: "Settings", iconName: "Settings" },
  { path: "/security", label: "Security", iconName: "Shield" },
];

/** Build the full NavItem array — called once in RootLayout.tsx with injected icon nodes. */
export function buildNav(
  icons: Record<string, ReactNode>,
): NavItem[] {
  return NAV_DESCRIPTORS.map(({ path, label, iconName, exact }) => ({
    path,
    label,
    icon: icons[iconName],
    exact,
  }));
}
