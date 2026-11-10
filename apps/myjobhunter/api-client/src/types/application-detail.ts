import type { Application } from "./application";
import type { ApplicationEvent } from "./application-event";
import type { ApplicationContact } from "./contact/application-contact";

/**
 * GET /applications/{id}: the application with its timeline (newest first)
 * and its contacts. Mirrors `ApplicationDetailResponse` in
 * apps/myjobhunter/backend/app/schemas/application/application_detail_response.py.
 */
export interface ApplicationDetail extends Application {
  events: ApplicationEvent[];
  contacts: ApplicationContact[];
}
