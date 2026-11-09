import { baseApi } from "@platform/core/store/baseApi";
import type { CreateTaxReturnParams } from "../types/tax/CreateTaxReturnParams";
import type { FormOverviewItem } from "../types/tax/FormOverviewItem";
import type { FormWithFields } from "../types/tax/FormWithFields";
import type { OverrideFieldParams } from "../types/tax/OverrideFieldParams";
import type { SourceDocumentsResponse } from "../types/tax/SourceDocumentsResponse";
import type { RecomputeResponse } from "../types/tax/RecomputeResponse";
import type { TaxAdvisorCachedResponse } from "../types/tax/TaxAdvisorCachedResponse";
import type { TaxReturn } from "../types/tax/TaxReturn";
import type { UpdateSuggestionStatusParams } from "../types/tax/UpdateSuggestionStatusParams";
import type { ValidationResult } from "../types/tax/ValidationResult";
import { overrideFieldBody } from "../utils/taxFieldOverride";

export const taxReturnsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["TaxReturn", "TaxAdvisor", "Summary"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listTaxReturns: builder.query<TaxReturn[], void>({
      query: () => ({ url: "/tax-returns" }),
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "TaxReturn" as const, id: r.id })), { type: "TaxReturn", id: "LIST" }]
          : [{ type: "TaxReturn", id: "LIST" }],
    }),
    createTaxReturn: builder.mutation<TaxReturn, CreateTaxReturnParams>({
      query: (data) => ({ url: "/tax-returns", method: "POST", data }),
      invalidatesTags: [{ type: "TaxReturn", id: "LIST" }],
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
      invalidatesTags: (_result, _err, id) => [{ type: "TaxReturn", id }, "Summary"],
    }),
    getValidation: builder.query<ValidationResult[], string>({
      query: (id) => ({ url: `/tax-returns/${id}/validation` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getSourceDocuments: builder.query<SourceDocumentsResponse, string>({
      query: (returnId) => ({ url: `/tax-returns/${returnId}/source-documents` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getFormFields: builder.query<FormWithFields, { return_id: string; form_name: string }>({
      query: ({ return_id, form_name }) => ({ url: `/tax-returns/${return_id}/forms/${form_name}` }),
      providesTags: (_result, _err, { return_id }) => [{ type: "TaxReturn", id: return_id }],
    }),
    overrideField: builder.mutation<void, OverrideFieldParams>({
      query: (params) => ({
        url: `/tax-returns/${params.return_id}/fields/${params.field_id}`,
        method: "PATCH",
        data: overrideFieldBody(params),
      }),
      invalidatesTags: (_result, _err, { return_id }) => [{ type: "TaxReturn", id: return_id }, "Summary"],
    }),
    getAdvisorSuggestions: builder.query<TaxAdvisorCachedResponse, string>({
      query: (taxReturnId) => ({ url: `/tax-returns/${taxReturnId}/advisor` }),
      providesTags: (_, __, id) => [{ type: "TaxAdvisor" as const, id }],
    }),
    generateAdvisorSuggestions: builder.mutation<TaxAdvisorCachedResponse, string>({
      query: (taxReturnId) => ({ url: `/tax-returns/${taxReturnId}/advisor/generate`, method: "POST" }),
      invalidatesTags: (_, __, id) => [{ type: "TaxAdvisor" as const, id }],
    }),
    updateSuggestionStatus: builder.mutation<void, UpdateSuggestionStatusParams>({
      query: ({ returnId, suggestionId, status }) => ({
        url: `/tax-returns/${returnId}/advisor/${suggestionId}`,
        method: "PATCH",
        data: { status },
      }),
      invalidatesTags: (_, __, { returnId }) => [{ type: "TaxAdvisor" as const, id: returnId }],
    }),
  }),
});

export const {
  useCreateTaxReturnMutation,
  useGetFormFieldsQuery,
  useOverrideFieldMutation,
  useGetAdvisorSuggestionsQuery,
  useGenerateAdvisorSuggestionsMutation,
  useUpdateSuggestionStatusMutation,
  useListTaxReturnsQuery,
  useGetTaxReturnQuery,
  useGetFormsOverviewQuery,
  useRecomputeMutation,
  useGetValidationQuery,
  useGetSourceDocumentsQuery,
} = taxReturnsApi;
