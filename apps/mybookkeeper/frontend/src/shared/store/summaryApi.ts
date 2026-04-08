import { baseApi } from "./baseApi";
import type { SummaryResponse } from "@/shared/types/summary/summary";
import type { TaxSummaryResponse } from "@/shared/types/summary/tax-summary";

export interface SummaryParams {
  startDate?: string;
  endDate?: string;
  propertyIds?: string[];
}

const summaryApi = baseApi.injectEndpoints({
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
    getTaxSummary: builder.query<TaxSummaryResponse, number>({
      query: (year) => ({ url: "/summary/tax", params: { year } }),
      providesTags: ["Summary"],
    }),
  }),
});

export const { useGetSummaryQuery, useGetTaxSummaryQuery } = summaryApi;
