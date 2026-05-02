/**
 * PATCH /listings/blackouts/{blackout_id} request body.
 *
 * Mirrors `schemas/listings/blackout_update_request.py`.
 */
export interface BlackoutUpdateRequest {
  host_notes: string | null;
}
