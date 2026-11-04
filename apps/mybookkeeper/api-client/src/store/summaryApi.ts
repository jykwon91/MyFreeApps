import { baseApi } from "@platform/core/store/baseApi";
import type { SummaryParams } from "../types/summary/SummaryParams";
import type { SummaryResponse } from "../types/summary/summary";
import type { TaxSummaryResponse } from "../types/summary/TaxSummaryResponse";

export const summaryApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Summary"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getSummary: builder.query<SummaryResponse, SummaryParams | void>({
      query: (params) => {
        if (!params) return { url: "/summary" };
        const sp = new URLSearchParams();
        if (params.startDate) sp.append("start_date", params.startDate);
        if (params.endDate) sp.append("end_date", params.endDate);
        if (params.propertyIds?.length) {
          params.propertyIds.forEach((id) => sp.append("property_ids", id));
        }
        const qs = sp.toString();
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
