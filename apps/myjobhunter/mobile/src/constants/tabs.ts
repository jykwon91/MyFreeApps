import type { AppTab } from "@platform/mobile";

export const DASHBOARD_TAB: AppTab = { name: "index", title: "Dashboard", webPath: "/dashboard" };
export const APPLICATIONS_TAB: AppTab = { name: "applications", title: "Applications", webPath: "/applications" };
export const PROFILE_TAB: AppTab = { name: "profile", title: "Profile", webPath: "/profile" };
export const MORE_TAB: AppTab = { name: "more", title: "More", webPath: "/settings" };

/** In the order the tab bar shows them. */
export const TABS: readonly AppTab[] = [DASHBOARD_TAB, APPLICATIONS_TAB, PROFILE_TAB, MORE_TAB];
