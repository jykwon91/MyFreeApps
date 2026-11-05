import { baseApi } from "@platform/core/store/baseApi";
import type { SourceDocumentsResponse } from "../types/tax/SourceDocumentsResponse";

export const taxDocumentsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Document", "TaxReturn"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listTaxDocuments: builder.query<SourceDocumentsResponse, { tax_year?: number } | void>({
      query: (params) => ({
        url: "/tax-documents",
        params: params && "tax_year" in params ? { tax_year: params.tax_year } : undefined,
      }),
      // "Document" because a change to any document can change this list.
      providesTags: ["Document", { type: "TaxReturn", id: "TAX_DOCS" }],
    }),
  }),
});

export const { useListTaxDocumentsQuery } = taxDocumentsApi;
