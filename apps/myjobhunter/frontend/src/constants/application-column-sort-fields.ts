import type { ApplicationSortField } from "@myjobhunter/api-client/types/application/application-sort-field";

/** The server sort behind each sortable applications-table column, keyed by column id. */
export const APPLICATION_COLUMN_SORT_FIELDS: Partial<Record<string, ApplicationSortField>> = {
  company_name: "company",
  role_title: "role",
  latest_status: "status",
  location: "location",
  remote_type: "remote",
  applied_at: "applied",
  fit_score: "fit",
};
