import { baseApi } from "@platform/core/store/baseApi";
import type { SavingsIdea } from "../types/savings/savings-idea";
import type { SavingsIdeaStatusUpdate } from "../types/savings/savings-idea-status-update";
import type { SavingsOverview } from "../types/savings/savings-overview";
import type { SavingsResearchStarted } from "../types/savings/savings-research-started";

/** The Savings page: researched ideas, the daily research switch and "Research now". */
export const savingsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Savings"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getSavingsOverview: builder.query<SavingsOverview, void>({
      query: () => ({ url: "/savings" }),
      providesTags: ["Savings"],
    }),

    setSavingsResearchEnabled: builder.mutation<SavingsOverview, boolean>({
      query: (enabled) => ({ url: "/savings/settings", method: "PUT", data: { enabled } }),
      // The response is the whole overview, so the page switches state without a second read.
      async onQueryStarted(_enabled, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(savingsApi.util.updateQueryData("getSavingsOverview", undefined, () => data));
        } catch {
          // The caller reports the failure, and the cache still holds the old state.
        }
      },
    }),

    startSavingsResearch: builder.mutation<SavingsResearchStarted, void>({
      query: () => ({ url: "/savings/research", method: "POST" }),
      invalidatesTags: ["Savings"],
    }),

    setSavingsIdeaStatus: builder.mutation<SavingsIdea, SavingsIdeaStatusUpdate>({
      query: ({ id, status }) => ({ url: `/savings/ideas/${id}`, method: "PATCH", data: { status } }),
      invalidatesTags: ["Savings"],
    }),
  }),
});

export const {
  useGetSavingsOverviewQuery,
  useSetSavingsResearchEnabledMutation,
  useStartSavingsResearchMutation,
  useSetSavingsIdeaStatusMutation,
} = savingsApi;
