export interface SignedLeaseImportRequest {
  applicant_id: string;
  listing_id?: string;
  starts_on?: string;
  ends_on?: string;
  notes?: string;
  status?: string;
  files: File[];
  /** Optional successor pointer (same semantics as the create flow). */
  parent_lease_id?: string;
}
