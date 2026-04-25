import type { NavItem } from "@/shared/lib/constants";

export const ADMIN_NAV: readonly NavItem[] = [
  { to: "/admin", label: "Users & Orgs" },
  { to: "/admin/system-health", label: "System Health" },
  { to: "/admin/costs", label: "Cost Monitoring" },
  { to: "/admin/user-activity", label: "User Activity" },
  { to: "/admin/demo", label: "Demo" },
] as const;
