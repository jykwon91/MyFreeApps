import { baseApi } from "@platform/core/store/baseApi";
import type { TaxCompletenessResponse } from "../types/tax/TaxCompletenessResponse";

export const taxCompletenessApi = baseApi.enhanceEndpoints({ addTagTypes: ["TaxReturn"] }).injectEndpoints({
  endpoints: (build) => ({
    getTaxCompleteness: build.query<TaxCompletenessResponse, { taxYear: number }>({
      query: ({ taxYear }) => ({ url: `/tax-completeness/${taxYear}`, method: "GET" }),
      // Recalculating tags one return, and a finished document tags TAX_DOCS. A plain tag reaches neither.
      providesTags: (result) => [
        "TaxReturn",
        { type: "TaxReturn", id: "TAX_DOCS" },
        ...(result ? [{ type: "TaxReturn" as const, id: result.tax_return_id }] : []),
      ],
    }),
  }),
});

export const { useGetTaxCompletenessQuery } = taxCompletenessApi;
