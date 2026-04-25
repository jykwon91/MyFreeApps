import { baseApi } from "./baseApi";
import type { CostSummary, UserCost, DailyCost, CostThresholds } from "@/shared/types/admin/cost";

interface SmtpStatus {
  configured: boolean;
  from_email: string;
  from_name: string;
  recipients: string[];
}

interface SmtpTestResponse {
  success: boolean;
  message: string;
}

export const costsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCostSummary: build.query<CostSummary, void>({
      query: () => ({ url: "/admin/costs/summary", method: "GET" }),
      providesTags: ["Cost"],
    }),
    getCostByUser: build.query<UserCost[], { period?: string; limit?: number }>({
      query: (params) => ({ url: "/admin/costs/by-user", method: "GET", params }),
      providesTags: ["Cost"],
    }),
    getCostTimeline: build.query<DailyCost[], { days?: number }>({
      query: (params) => ({ url: "/admin/costs/timeline", method: "GET", params }),
      providesTags: ["Cost"],
    }),
    getCostThresholds: build.query<CostThresholds, void>({
      query: () => ({ url: "/admin/costs/thresholds", method: "GET" }),
      providesTags: ["Cost"],
    }),
    updateCostThresholds: build.mutation<CostThresholds, Partial<CostThresholds>>({
      query: (body) => ({ url: "/admin/costs/thresholds", method: "PATCH", data: body }),
      invalidatesTags: ["Cost"],
    }),
    getSmtpStatus: build.query<SmtpStatus, void>({
      query: () => ({ url: "/admin/costs/smtp-status", method: "GET" }),
    }),
    testSmtp: build.mutation<SmtpTestResponse, { email: string }>({
      query: (data) => ({ url: "/admin/costs/smtp-test", method: "POST", data }),
    }),
  }),
});

export const {
  useGetCostSummaryQuery,
  useGetCostByUserQuery,
  useGetCostTimelineQuery,
  useGetCostThresholdsQuery,
  useUpdateCostThresholdsMutation,
  useGetSmtpStatusQuery,
  useTestSmtpMutation,
} = costsApi;
