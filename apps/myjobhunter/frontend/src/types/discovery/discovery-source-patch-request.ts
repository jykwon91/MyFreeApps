/** Body for ``PATCH /discover/sources/{id}``. All fields optional; at least one required. */
export interface DiscoverySourcePatchRequest {
  fetch_interval_minutes?: number;
  name?: string;
  is_active?: boolean;
}
