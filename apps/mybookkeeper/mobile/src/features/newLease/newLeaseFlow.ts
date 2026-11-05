import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import type { NewLeaseRouteParams } from "../../types/NewLeaseRouteParams";

export function flowFromParams({ template_ids, applicant_id, parent_lease_id }: NewLeaseRouteParams): NewLeaseFlow {
  return {
    templateIds: template_ids ? template_ids.split(",").filter(Boolean) : [],
    applicantId: applicant_id,
    parentLeaseId: parent_lease_id,
  };
}

function withParams(path: string, { templateIds, applicantId, parentLeaseId }: NewLeaseFlow): string {
  const params = new URLSearchParams();
  if (templateIds.length > 0) params.set("template_ids", templateIds.join(","));
  if (applicantId) params.set("applicant_id", applicantId);
  if (parentLeaseId) params.set("parent_lease_id", parentLeaseId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function templatesPath(flow: Omit<NewLeaseFlow, "templateIds"> = {}): string {
  return withParams("/leases/new", { ...flow, templateIds: [] });
}

/** The next question still to answer: who it's for, then what goes in it. */
export function nextPath(flow: NewLeaseFlow): string {
  return withParams(flow.applicantId ? "/leases/new/details" : "/leases/new/applicant", flow);
}
