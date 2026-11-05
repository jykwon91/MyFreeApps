/** What's been chosen so far on the way to a new lease. */
export interface NewLeaseFlow {
  templateIds: string[];
  applicantId?: string;
  parentLeaseId?: string;
}
