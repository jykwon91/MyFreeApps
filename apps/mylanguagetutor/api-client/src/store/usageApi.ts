import { tutorBaseApi } from "./tutorBaseApi";
import type { UsageToday } from "../types/tutor/usage-today";

// The learner's own remaining daily budget -- checked before recording. Given the conversation's
// session id, the check is sized for that conversation's next turn, as the turn's reservation is.
const usageApi = tutorBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getUsageToday: build.query<UsageToday, string | void>({
      query: (sessionId) => ({
        url: "/usage/today",
        method: "GET",
        params: sessionId ? { session_id: sessionId } : undefined,
      }),
      providesTags: ["Usage"],
    }),
  }),
});

export const { useGetUsageTodayQuery } = usageApi;
export const usageApiUtil = usageApi.util;
