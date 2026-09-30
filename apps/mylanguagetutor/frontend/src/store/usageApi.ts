import { tutorBaseApi } from "@/store/tutorBaseApi";
import type { UsageToday } from "@/types/tutor/usage-today";

// The learner's own remaining daily budget -- checked before recording.
const usageApi = tutorBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getUsageToday: build.query<UsageToday, void>({
      query: () => ({ url: "/usage/today", method: "GET" }),
      providesTags: ["Usage"],
    }),
  }),
});

export const { useGetUsageTodayQuery } = usageApi;
export const usageApiUtil = usageApi.util;
