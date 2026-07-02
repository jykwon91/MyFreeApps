import type { ReactNode } from "react";
import type { NavItem } from "@platform/ui";

// Icon nodes are created at runtime in RootLayout.tsx and passed in via buildNav.
// This module exports typed descriptors -- icons are injected at component level
// so this file stays free of JSX and React imports.

interface NavDescriptor {
  path: string;
  label: string;
  iconName: string;
  exact?: boolean;
}

const NAV_DESCRIPTORS: NavDescriptor[] = [
  { path: "/", label: "Recipes", iconName: "Recipes", exact: true },
  { path: "/settings", label: "Settings", iconName: "Settings" },
  { path: "/security", label: "Security", iconName: "Shield" },
];

/**
 * Paths that appear in the unauthenticated GuestShell sidebar.
 *
 * MyRecipes uses a public-read / auth-write model: anyone can browse the recipe
 * library, but only the owner can create / tweak / cook. Guests see just the
 * recipes list; /settings and /security are account pages, kept out of the
 * guest nav so unauthenticated visitors don't see dead links to gated pages.
 */
export const PUBLIC_NAV_PATHS: ReadonlySet<string> = new Set([
  "/", // Recipes (public library)
]);

/**
 * Build the full NavItem array -- called once in RootLayout.tsx with injected
 * icon nodes.
 */
export function buildNav(icons: Record<string, ReactNode>): NavItem[] {
  return NAV_DESCRIPTORS.map(({ path, label, iconName, exact }) => ({
    path,
    label,
    icon: icons[iconName],
    exact,
  }));
}
