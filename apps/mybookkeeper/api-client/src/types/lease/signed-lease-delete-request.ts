/** The applicant id lets the delete refresh that tenant's dates, which come from their latest lease. */
export interface SignedLeaseDeleteRequest {
  leaseId: string;
  applicantId: string;
}
