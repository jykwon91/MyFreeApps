import type { Application } from "@myjobhunter/api-client/types/application";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { CompanyResearch } from "@myjobhunter/api-client/types/company-research";
import type { FakeReply } from "./types/FakeReply";
import type { FakeRoute } from "./types/FakeRoute";

/**
 * What the server answers for one company's screen: the company, its research (a 404 when none
 * has been run) and its applications. Spread first, so a test's own routes override these.
 */
export function companyDetailRoutes(
  company: Company,
  { research = null, applications = [] }: { research?: CompanyResearch | null; applications?: readonly Application[] } = {},
): Record<string, FakeRoute> {
  return {
    [`GET /companies/${company.id}`]: () => ({ status: 200, data: company }) satisfies FakeReply,
    [`GET /companies/${company.id}/research`]: () =>
      (research ? { status: 200, data: research } : { status: 404, data: { detail: "No research found" } }) satisfies FakeReply,
    "GET /applications": () => ({ status: 200, data: { items: applications, total: applications.length } }) satisfies FakeReply,
  };
}
