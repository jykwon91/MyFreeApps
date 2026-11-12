import type { MoreMenuGroup } from "@platform/mobile";

export const SETTINGS_MENU: readonly MoreMenuGroup[] = [
  {
    title: "Account",
    items: [
      { label: "Security", webPath: "/security" },
      { label: "Support MyFreeApps", webPath: "/support-myfreeapps" },
    ],
  },
];
