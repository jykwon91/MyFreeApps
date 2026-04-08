import { baseApi } from "./baseApi";
import type { TaxReturn } from "@/shared/types/tax/tax-return";
import type { FormWithFields } from "@/shared/types/tax/tax-form";
import type { ValidationResult } from "@/shared/types/tax/validation-result";
import type { TaxAdvisorCachedResponse } from "@/shared/types/tax/tax-advisor";
import type { SourceDocumentsResponse } from "@/shared/types/tax/source-document";

export interface CreateTaxReturnParams {
  tax_year: number;
  filing_status: string;
  jurisdiction?: string;
}

export interface OverrideFieldParams {
  return_id: string;
  field_id: string;
  value: number | string | boolean | null;
  override_reason: string;
  field_type: "numeric" | "text" | "boolean";
}

const taxReturnsApi = baseApi.injectEndpoints({
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
    getFormsOverview: builder.query<{ form_name: string; instance_count: number; field_count: number }[], string>({
      query: (returnId) => ({ url: `/tax-returns/${returnId}/forms-overview` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getFormFields: builder.query<FormWithFields, { return_id: string; form_name: string }>({
      query: ({ return_id, form_name }) => ({ url: `/tax-returns/${return_id}/forms/${form_name}` }),
      providesTags: (_result, _err, { return_id }) => [{ type: "TaxReturn", id: return_id }],
    }),
    recompute: builder.mutation<TaxReturn, string>({
      query: (id) => ({ url: `/tax-returns/${id}/recompute`, method: "POST" }),
      invalidatesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    overrideField: builder.mutation<void, OverrideFieldParams>({
      query: ({ return_id, field_id, value, override_reason, field_type }) => {
        const data: Record<string, unknown> = { override_reason };
        if (field_type === "numeric") data.value_numeric = value;
        else if (field_type === "boolean") data.value_boolean = value;
        else data.value_text = value;
        return {
          url: `/tax-returns/${return_id}/fields/${field_id}`,
          method: "PATCH",
          data,
        };
      },
      invalidatesTags: (_result, _err, { return_id }) => [{ type: "TaxReturn", id: return_id }],
    }),
    getValidation: builder.query<ValidationResult[], string>({
      query: (id) => ({ url: `/tax-returns/${id}/validation` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getSourceDocuments: builder.query<SourceDocumentsResponse, string>({
      query: (returnId) => ({ url: `/tax-returns/${returnId}/source-documents` }),
      providesTags: (_result, _err, id) => [{ type: "TaxReturn", id }],
    }),
    getAdvisorSuggestions: builder.query<TaxAdvisorCachedResponse, string>({
      query: (taxReturnId) => ({ url: `/tax-returns/${taxReturnId}/advisor` }),
      providesTags: (_, __, id) => [{ type: "TaxAdvisor" as const, id }],
    }),
    generateAdvisorSuggestions: builder.mutation<TaxAdvisorCachedResponse, string>({
      query: (taxReturnId) => ({ url: `/tax-returns/${taxReturnId}/advisor/generate`, method: "POST" }),
      invalidatesTags: (_, __, id) => [{ type: "TaxAdvisor" as const, id }],
    }),
    updateSuggestionStatus: builder.mutation<void, { returnId: string; suggestionId: string; status: "active" | "dismissed" | "resolved" }>({
      query: ({ returnId, suggestionId, status }) => ({
        url: `/tax-returns/${returnId}/advisor/${suggestionId}`,
        method: "PATCH",
        data: { status },
      }),
      invalidatesTags: (_, __, { returnId }) => [{ type: "TaxAdvisor" as const, id: returnId }],
    }),
    deleteTaxReturn: builder.mutation<void, string>({
      query: (id) => ({ url: `/tax-returns/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "TaxReturn", id: "LIST" }],
    }),
    listTaxDocuments: builder.query<SourceDocumentsResponse, { tax_year?: number } | void>({
      query: (params) => ({
        url: "/tax-documents",
        params: params && "tax_year" in params ? { tax_year: params.tax_year } : undefined,
      }),
      providesTags: [{ type: "TaxReturn", id: "TAX_DOCS" }],
    }),
  }),
});

export const {
  useListTaxReturnsQuery,
  useCreateTaxReturnMutation,
  useGetTaxReturnQuery,
  useGetFormsOverviewQuery,
  useGetFormFieldsQuery,
  useGetSourceDocumentsQuery,
  useRecomputeMutation,
  useOverrideFieldMutation,
  useGetValidationQuery,
  useGetAdvisorSuggestionsQuery,
  useGenerateAdvisorSuggestionsMutation,
  useUpdateSuggestionStatusMutation,
  useDeleteTaxReturnMutation,
  useListTaxDocumentsQuery,
} = taxReturnsApi;
