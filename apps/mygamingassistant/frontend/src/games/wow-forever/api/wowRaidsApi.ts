import { baseApi } from "@platform/ui";
import { PLANNER_AUTH_SCHEME } from "@/games/wow-forever/data/raidPlanner";
import type { RaidPage } from "@/games/wow-forever/types/raid";
import type { PlannerArgs, RaidPlan, RaidPlanSave, RaidPlanSaved } from "@/games/wow-forever/types/raidPlan";

const raidsBaseApi = baseApi.enhanceEndpoints({ addTagTypes: ["WowRaid"] });

const wowRaidsApi = raidsBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getRaidPage: build.query<RaidPage, string>({
      query: (webId) => ({ url: raidUrl(webId), method: "GET" }),
      providesTags: (_result, _error, webId) => [{ type: "WowRaid", id: webId }],
    }),
    // Read once per planner page and never polled, so a roster change can't overwrite the leader's moves; gone as
    // soon as the page is.
    getRaidPlan: build.query<RaidPlan, PlannerArgs>({
      query: ({ webId, token }) => ({ url: planUrl(webId), method: "GET", headers: plannerHeaders(token) }),
      keepUnusedDataFor: 0,
    }),
    saveRaidPlan: build.mutation<RaidPlanSaved, PlannerArgs & { body: RaidPlanSave }>({
      query: ({ webId, token, body }) => ({
        url: planUrl(webId),
        method: "PUT",
        data: body,
        headers: plannerHeaders(token),
      }),
      // The raid page shows the groups while they're published.
      invalidatesTags: (_result, _error, { webId }) => [{ type: "WowRaid", id: webId }],
    }),
  }),
});

export const { useGetRaidPageQuery, useGetRaidPlanQuery, useSaveRaidPlanMutation } = wowRaidsApi;

function raidUrl(webId: string): string {
  return `/wow/raids/${encodeURIComponent(webId)}`;
}

function planUrl(webId: string): string {
  return `${raidUrl(webId)}/plan`;
}

/** The leader's link token. The shared client adds its own `Bearer` only to a request that names none. */
function plannerHeaders(token: string): Record<string, string> {
  return { Authorization: `${PLANNER_AUTH_SCHEME} ${token}` };
}
