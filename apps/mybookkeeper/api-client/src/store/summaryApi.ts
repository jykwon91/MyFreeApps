import { baseApi } from "@platform/core/store/baseApi";
import type { SummaryParams } from "../types/summary/SummaryParams";
import type { SummaryResponse } from "../types/summary/summary";
import type { TaxSummaryResponse } from "../types/summary/TaxSummaryResponse";
import { queryString } from "../utils/queryString";

export const summaryApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Summary"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getSummary: builder.query<SummaryResponse, SummaryParams | void>({
      query: (params) => {
        const qs = params
          ? queryString({ start_date: params.startDate, end_date: params.endDate, property_ids: params.propertyIds })
          : "";
        return { url: qs ? `/summary?${qs}` : "/summary" };
      },
      providesTags: ["Summary"],
    }),
    getSummaryYears: builder.query<number[], void>({
      query: () => ({ url: "/summary/years" }),
      providesTags: ["Summary"],
    }),
    getTaxSummary: builder.query<TaxSummaryResponse, number>({
      query: (year) => ({ url: "/summary/tax", params: { year } }),
      providesTags: ["Summary"],
    }),
  }),
});

export const { useGetSummaryQuery, useGetSummaryYearsQuery, useGetTaxSummaryQuery } =
  summaryApi;
