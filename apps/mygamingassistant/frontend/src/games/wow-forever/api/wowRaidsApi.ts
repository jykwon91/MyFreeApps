import { baseApi } from "@platform/ui";
import type { RaidPage } from "@/games/wow-forever/types/raid";

const raidsBaseApi = baseApi.enhanceEndpoints({ addTagTypes: ["WowRaid"] });

/** A posted raid's public page, by the id in its link (`GET /wow/raids/{web_id}`, `app/api/raid_web.py`). */
const wowRaidsApi = raidsBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getRaidPage: build.query<RaidPage, string>({
      query: (webId) => ({ url: `/wow/raids/${encodeURIComponent(webId)}`, method: "GET" }),
      providesTags: (_result, _error, webId) => [{ type: "WowRaid", id: webId }],
    }),
  }),
});

export const { useGetRaidPageQuery } = wowRaidsApi;
