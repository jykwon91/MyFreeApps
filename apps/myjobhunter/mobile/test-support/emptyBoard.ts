import type { FakeRoute } from "./types/FakeRoute";

/** The Dashboard tab's board for an account with no applications yet, for tests that only need the tab to open. */
export const EMPTY_BOARD: Record<string, FakeRoute> = {
  "GET /applications?view=kanban": () => ({ status: 200, data: { items: [], total: 0 } }),
};
