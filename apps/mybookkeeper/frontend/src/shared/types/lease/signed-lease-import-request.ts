export interface SignedLeaseImportRequest {
  applicant_id: string;
  listing_id?: string;
  starts_on?: string;
  ends_on?: string;
  notes?: string;
  status?: string;
  files: File[];
}
