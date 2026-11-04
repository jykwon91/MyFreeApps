/**
 * Query args for GET /applicants/tenants.
 */
export interface TenantListArgs {
  include_ended?: boolean;
  limit?: number;
  offset?: number;
}
