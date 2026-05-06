/**
 * Static metadata for the admin dashboard's card list. Icons and
 * navigation targets are resolved at render time from the page so the
 * data layer here stays free of JSX and route imports — keeps this
 * file tree-shakeable and easy to test.
 *
 * To add a new admin function:
 *   1. Add an entry below.
 *   2. Add an icon mapping + route target in `pages/admin/AdminDashboard.tsx`.
 *   3. Register the route in `routes.tsx` under `<RequireSuperuser>`.
 */
export const ADMIN_DASHBOARD_CARD_ID = {
  DEMO: "demo",
  INVITES: "invites",
} as const;

export type AdminDashboardCardId =
  (typeof ADMIN_DASHBOARD_CARD_ID)[keyof typeof ADMIN_DASHBOARD_CARD_ID];

export interface AdminDashboardCardMeta {
  id: AdminDashboardCardId;
  title: string;
  description: string;
}

export const ADMIN_DASHBOARD_CARDS: readonly AdminDashboardCardMeta[] = [
  {
    id: ADMIN_DASHBOARD_CARD_ID.DEMO,
    title: "Demo accounts",
    description:
      "Create / list / delete pre-seeded demo users for showcasing the app.",
  },
  {
    id: ADMIN_DASHBOARD_CARD_ID.INVITES,
    title: "Invites",
    description:
      "Invite a specific person by email. They get a tokenised registration link.",
  },
];
