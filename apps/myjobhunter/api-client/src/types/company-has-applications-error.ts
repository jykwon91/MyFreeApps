/**
 * RTK Query error returned by `DELETE /companies/{id}` when applications
 * (soft-deleted ones included) still reference the company.
 * Mirrors the 409 body in apps/myjobhunter/backend/app/api/companies.py.
 */
export interface CompanyHasApplicationsError {
  status: 409;
  data: {
    detail: {
      code: "COMPANY_HAS_APPLICATIONS";
      message: string;
      application_count: number;
    };
  };
}
