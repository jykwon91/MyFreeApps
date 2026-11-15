import { baseApi } from "@platform/core/store/baseApi";
import { APPLICATIONS_TAG } from "../constants/applicationsTag";
import { COMPANIES_LIST_ID, COMPANIES_TAG } from "../constants/companiesTags";
import type { Company } from "../types/company";
import type { CompanyListResponse } from "../types/company-list-response";
import type { CompanyCreateRequest } from "../types/company-create-request";
import type { CompanyUpdateRequest } from "../types/company-update-request";
import type { CompanyResearch } from "../types/company-research";

const COMPANY_RESEARCH_TAG = "CompanyResearch";

const companiesApi = baseApi
  .enhanceEndpoints({ addTagTypes: [COMPANIES_TAG, COMPANY_RESEARCH_TAG, APPLICATIONS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      listCompanies: build.query<CompanyListResponse, void>({
        query: () => ({ url: "/companies", method: "GET" }),
        providesTags: (result) =>
          result
            ? [
                ...result.items.map(({ id }) => ({ type: COMPANIES_TAG, id }) as const),
                { type: COMPANIES_TAG, id: COMPANIES_LIST_ID } as const,
              ]
            : [{ type: COMPANIES_TAG, id: COMPANIES_LIST_ID } as const],
      }),

      getCompany: build.query<Company, string>({
        query: (id) => ({ url: `/companies/${id}`, method: "GET" }),
        providesTags: (_result, _err, id) => [{ type: COMPANIES_TAG, id }],
      }),

      createCompany: build.mutation<Company, CompanyCreateRequest>({
        query: (body) => ({ url: "/companies", method: "POST", data: body }),
        invalidatesTags: [{ type: COMPANIES_TAG, id: COMPANIES_LIST_ID }],
      }),

      updateCompany: build.mutation<Company, { id: string; patch: CompanyUpdateRequest }>({
        query: ({ id, patch }) => ({ url: `/companies/${id}`, method: "PATCH", data: patch }),
        invalidatesTags: (_result, _err, { id }) => [
          { type: COMPANIES_TAG, id },
          { type: COMPANIES_TAG, id: COMPANIES_LIST_ID },
          // Applications list, kanban and detail embed company name/logo via a
          // join. The PATCH response carries no application ids, so invalidate
          // the whole Applications type (list, kanban and every cached detail).
          { type: APPLICATIONS_TAG },
        ],
      }),

      // No Applications invalidation: the backend refuses to delete a company
      // that any application still references (CompanyHasApplicationsError),
      // so a successful delete cannot affect an application view.
      deleteCompany: build.mutation<void, string>({
        query: (id) => ({ url: `/companies/${id}`, method: "DELETE" }),
        invalidatesTags: (_result, _err, id) => [
          { type: COMPANIES_TAG, id },
          { type: COMPANIES_TAG, id: COMPANIES_LIST_ID },
        ],
      }),

      // Research sub-resource
      getCompanyResearch: build.query<CompanyResearch, string>({
        query: (companyId) => ({
          url: `/companies/${companyId}/research`,
          method: "GET",
        }),
        providesTags: (_result, _err, companyId) => [
          { type: COMPANY_RESEARCH_TAG, id: companyId },
        ],
      }),

      triggerCompanyResearch: build.mutation<CompanyResearch, string>({
        query: (companyId) => ({
          url: `/companies/${companyId}/research`,
          method: "POST",
          data: {},
        }),
        invalidatesTags: (_result, _err, companyId) => [
          { type: COMPANY_RESEARCH_TAG, id: companyId },
        ],
      }),
    }),
  });

export const {
  useListCompaniesQuery,
  useLazyListCompaniesQuery,
  useGetCompanyQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
  useDeleteCompanyMutation,
  useGetCompanyResearchQuery,
  useTriggerCompanyResearchMutation,
} = companiesApi;
