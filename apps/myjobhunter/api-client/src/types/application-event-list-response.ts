import type { ApplicationEvent } from "./application-event";

/**
 * Shape of `GET /applications/{id}/events`. Same `{items, total}` envelope
 * as `/applications` and `/companies` for consistency.
 */
export interface ApplicationEventListResponse {
  items: ApplicationEvent[];
  total: number;
}
