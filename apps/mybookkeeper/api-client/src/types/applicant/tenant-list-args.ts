/**
 * Query args for GET /applicants/tenants.
 */
export interface TenantListArgs {
  include_ended?: boolean;
  /** The host's date, so a lease runs out at their midnight, not the server's. */
  today: string;
  limit?: number;
  offset?: number;
}
