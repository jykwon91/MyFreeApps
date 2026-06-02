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
  /**
   * When true, this nav item is only included if `inTauri` is true (i.e.
   * the SPA is running inside the Tauri desktop binary). The web build
   * skips Tauri-only items entirely so the sidebar doesn't advertise
   * features the web user can't activate.
   */
  desktopOnly?: boolean;
}

const NAV_DESCRIPTORS: NavDescriptor[] = [
  { path: "/", label: "Games", iconName: "Gamepad2", exact: true },
  { path: "/packages", label: "Packages", iconName: "Package" },
  { path: "/sources", label: "Sources", iconName: "PlaySquare" },
  { path: "/review", label: "Review", iconName: "ClipboardList" },
  { path: "/live/cs2", label: "Live (CS2)", iconName: "Radio", desktopOnly: true },
  { path: "/settings", label: "Settings", iconName: "Settings" },
  { path: "/security", label: "Security", iconName: "Shield" },
  { path: "/support", label: "Support Me", iconName: "Heart" },
];

/**
 * Paths that appear in the unauthenticated GuestShell sidebar.
 *
 * Anything not in this set is operator-only and is filtered out of the
 * guest nav so unauthenticated visitors don't see dead links to gated
 * pages.
 *
 * MGA's public-read / auth-write model: see apps/mygamingassistant/CLAUDE.md
 * → Authentication Model.
 */
export const PUBLIC_NAV_PATHS: ReadonlySet<string> = new Set([
  "/",            // Games (public lineup library)
  "/packages",    // Packages (public — read-only browsing)
  "/live/cs2",    // Live mode (read-only; setup/calibrate inside are gated)
  "/support",     // Support Me (public donation / cost-transparency page)
]);

/**
 * Build the full NavItem array — called once in RootLayout.tsx with injected
 * icon nodes.
 *
 * @param icons    Map of icon-name → ReactNode (injected at the component layer).
 * @param inTauri  True when running inside the Tauri desktop binary; filters
 *                 out `desktopOnly` items in the web build.
 */
export function buildNav(
  icons: Record<string, ReactNode>,
  inTauri: boolean = false,
): NavItem[] {
  return NAV_DESCRIPTORS.filter((d) => !d.desktopOnly || inTauri).map(
    ({ path, label, iconName, exact }) => ({
      path,
      label,
      icon: icons[iconName],
      exact,
    }),
  );
}
