/** What the add-company form holds, as typed. `companyCreateRequest` trims it into the request. */
export interface CompanyFormValues {
  name: string;
  primary_domain: string;
  industry: string;
  hq_location: string;
}
