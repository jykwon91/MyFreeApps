import type { AppTab } from "@platform/mobile";

export const PRACTICE_TAB: AppTab = { name: "index", title: "Practice", webPath: "/scenarios" };
export const SETTINGS_TAB: AppTab = { name: "settings", title: "Settings", webPath: "/settings" };

/** In the order the tab bar shows them. */
export const TABS: readonly AppTab[] = [PRACTICE_TAB, SETTINGS_TAB];
