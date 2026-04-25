import { baseApi } from "./baseApi";
import type { TaxCompletenessResponse } from "@/shared/types/tax/tax-completeness";

const taxCompletenessApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTaxCompleteness: build.query<TaxCompletenessResponse, { taxYear: number }>({
      query: ({ taxYear }) => ({ url: `/tax-completeness/${taxYear}`, method: "GET" }),
      providesTags: ["TaxReturn"],
    }),
  }),
});

export const { useGetTaxCompletenessQuery } = taxCompletenessApi;
