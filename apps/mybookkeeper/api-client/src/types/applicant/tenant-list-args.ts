/**
 * Query args for GET /applicants/tenants.
 */
export interface TenantListArgs {
  include_ended?: boolean;
  today?: string;
  limit?: number;
  offset?: number;
}
