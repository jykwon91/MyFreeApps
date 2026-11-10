import type { Application } from "./application";

/**
 * Shape of `GET /applications` response. The backend wraps the array in
 * `{items, total}` so future pagination / summary additions don't break
 * existing clients (PR 2.1b in `apps/myjobhunter/backend/app/api/applications.py`).
 */
export interface ApplicationListResponse {
  items: Application[];
  total: number;
}
