/** A record of cooking a version (server response). */
export interface CookLogResponse {
  id: string;
  version_id: string;
  cooked_at: string;
  rating: number | null;
  outcome_notes: string | null;
  created_at: string;
}

/** Body for POST /recipes/{id}/versions/{vid}/cooks. `rating` is 1-5. */
export interface CookLogCreateRequest {
  cooked_at?: string | null;
  rating?: number | null;
  outcome_notes?: string | null;
}
