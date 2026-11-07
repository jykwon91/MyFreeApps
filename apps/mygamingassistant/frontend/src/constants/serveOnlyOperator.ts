import { TRIAGE_PAGE_PATH } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";

/** The serve-only operator's header links: the only signed-in work a serve-only build supports. */
export const SERVE_ONLY_OPERATOR_LINKS = [
  { path: TRIAGE_PAGE_PATH, label: "Triage" },
  // Two-factor settings only on serve-only (the page's other APIs aren't mounted there).
  { path: "/security", label: "Two-factor" },
] as const;
