import type { ApplicationDetail } from "@myjobhunter/api-client/types/application-detail";
import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import { companyRecord } from "./companyRecord";
import type { FakeReply } from "./types/FakeReply";
import type { FakeRoute } from "./types/FakeRoute";

const ok = (data: unknown): FakeRoute => () => ({ status: 200, data }) satisfies FakeReply;

/**
 * What the server answers for one application's screen: the application, its company,
 * its timeline and its documents. Spread first, so a test's own routes override these.
 */
export function applicationDetailRoutes(
  application: ApplicationDetail,
  { events = application.events, documents = [] }: { events?: readonly ApplicationEvent[]; documents?: readonly Document[] } = {},
): Record<string, FakeRoute> {
  return {
    [`GET /applications/${application.id}`]: ok(application),
    [`GET /applications/${application.id}/events`]: ok({ items: events, total: events.length }),
    [`GET /companies/${application.company_id}`]: ok(companyRecord({ id: application.company_id, name: "Stripe" })),
    "GET /documents": ok({ items: documents, total: documents.length }),
  };
}
