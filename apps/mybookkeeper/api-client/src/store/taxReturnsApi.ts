import { baseApi } from "@platform/core/store/baseApi";
import type { FormOverviewItem } from "../types/tax/FormOverviewItem";
import type { SourceDocumentsResponse } from "../types/tax/SourceDocumentsResponse";
import type { RecomputeResponse } from "../types/tax/RecomputeResponse";
import type { TaxReturn } from "../types/tax/TaxReturn";
import type { ValidationResult } from "../types/tax/ValidationResult";

export const taxReturnsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["TaxReturn"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listTaxReturns: builder.query<TaxReturn[], void>({
      query: () => ({ url: "/tax-returns" }),
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "TaxReturn" as const, id: r.id })), { type: "TaxReturn", id: "LIST" }]
          : [{ type: "TaxReturn", id: "LIST" }],
    }),
    getTaxReturn: builder.query<TaxReturn, string>({
      query: (id) => ({ url: `/tax-returns/${id}` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getFormsOverview: builder.query<FormOverviewItem[], string>({
      query: (returnId) => ({ url: `/tax-returns/${returnId}/forms-overview` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    recompute: builder.mutation<RecomputeResponse, string>({
      query: (id) => ({ url: `/tax-returns/${id}/recompute`, method: "POST" }),
      invalidatesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getValidation: builder.query<ValidationResult[], string>({
      query: (id) => ({ url: `/tax-returns/${id}/validation` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getSourceDocuments: builder.query<SourceDocumentsResponse, string>({
      query: (returnId) => ({ url: `/tax-returns/${returnId}/source-documents` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
  }),
});

export const {
  useListTaxReturnsQuery,
  useGetTaxReturnQuery,
  useGetFormsOverviewQuery,
  useRecomputeMutation,
  useGetValidationQuery,
  useGetSourceDocumentsQuery,
} = taxReturnsApi;
