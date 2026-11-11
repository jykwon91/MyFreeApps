import type { MoreMenuGroup } from "@platform/mobile";

export const MORE_MENU: readonly MoreMenuGroup[] = [
  {
    title: "Job search",
    items: [
      { label: "Analyze a job", webPath: "/analyze", screen: "/analyze" },
      { label: "Discovery", webPath: "/discover" },
      { label: "Companies", webPath: "/companies", screen: "/companies" },
    ],
  },
  {
    title: "Your materials",
    items: [
      { label: "Documents", webPath: "/documents", screen: "/documents" },
      { label: "Resume", webPath: "/resume" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Security", webPath: "/security" },
      { label: "Support MyFreeApps", webPath: "/support-myfreeapps" },
    ],
  },
];
