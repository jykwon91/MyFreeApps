/**
 * Public-facing listing payload returned by ``GET /api/listings/public/<slug>``.
 *
 * Strict subset of the operator listing — no PII, no internal IDs.
 */
export interface PublicListing {
  slug: string;
  title: string;
  description: string | null;
  monthly_rate: string;
  room_type: string;
  private_bath: boolean;
  parking_assigned: boolean;
  furnished: boolean;
  pets_on_premises: boolean;
}
