export interface SignedLeaseCreateRequest {
  template_id: string;
  applicant_id: string;
  listing_id?: string | null;
  values: Record<string, unknown>;
}
