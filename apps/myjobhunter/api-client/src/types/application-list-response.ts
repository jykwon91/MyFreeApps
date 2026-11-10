import type { Application } from "./application";

/**
 * One page of `GET /applications`: `items` is the page, `total` counts every
 * application matching the filters across all pages.
 */
export interface ApplicationListResponse {
  items: Application[];
  total: number;
}
