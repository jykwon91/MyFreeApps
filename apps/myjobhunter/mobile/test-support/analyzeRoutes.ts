import { EMPTY_BOARD } from "./emptyBoard";
import type { FakeReply } from "./types/FakeReply";
import type { FakeRoute } from "./types/FakeRoute";
import { tokens } from "./storedSession";

const DEVICES = [{ id: "s1", device_name: "Test Phone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-11-01T00:00:00Z" }];

/** What the screens around Analyze ask for: More's devices, an empty board and list. Overrides win. */
export function analyzeRoutes(routes: Record<string, FakeRoute> = {}): Record<string, FakeRoute> {
  return {
    "POST /auth/mobile/refresh": (): FakeReply => ({ status: 200, data: tokens(1) }),
    "GET /auth/mobile/sessions": (): FakeReply => ({ status: 200, data: DEVICES }),
    "GET /applications": (): FakeReply => ({ status: 200, data: { items: [], total: 0 } }),
    ...EMPTY_BOARD,
    ...routes,
  };
}
