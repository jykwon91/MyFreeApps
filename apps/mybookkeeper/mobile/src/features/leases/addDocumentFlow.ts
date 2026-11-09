export function addDocumentPath(leaseId: string): string {
  return `/leases/${leaseId}/add-document`;
}

export function addDocumentDetailsPath(leaseId: string, templateIds: readonly string[]): string {
  return `${addDocumentPath(leaseId)}/details?template_ids=${templateIds.join(",")}`;
}

export function templateIdsFromParam(param: string | undefined): string[] {
  return param ? param.split(",").filter(Boolean) : [];
}
