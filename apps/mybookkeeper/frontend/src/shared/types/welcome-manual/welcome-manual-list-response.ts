import type { WelcomeManualSummary } from "./welcome-manual-summary";

/**
 * Paginated envelope returned by GET /welcome-manuals. Mirrors the shared
 * backend `ListResponse[WelcomeManualSummary]`.
 */
export interface WelcomeManualListResponse {
  items: WelcomeManualSummary[];
  total: number;
  has_more: boolean;
}
