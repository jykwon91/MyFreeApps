import { baseApi } from "@platform/ui";
import type { ServerStatusHistoryResponse } from "@/games/wow-forever/types/serverStatus/serverStatusHistoryResponse";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus/serverStatusResponse";

/** Poll interval: 90 s while the tab is focused. */
const SERVER_STATUS_POLLING = {
  pollingInterval: 90_000,
  skipPollingIfUnfocused: true,
} as const;

/** The history gains a point at most every 5 minutes (the recorder's interval), so poll at that pace. */
const SERVER_STATUS_HISTORY_POLLING = {
  pollingInterval: 300_000,
  skipPollingIfUnfocused: true,
} as const;

const wowServerStatusApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getServerStatus: build.query<ServerStatusResponse, string>({
      query: (region) => ({ url: `/wow/server-status?region=${region}`, method: "GET" }),
    }),
    getServerStatusHistory: build.query<ServerStatusHistoryResponse, string>({
      query: (region) => ({ url: `/wow/server-status/history?region=${region}`, method: "GET" }),
    }),
  }),
});

export const { useGetServerStatusQuery, useGetServerStatusHistoryQuery } = wowServerStatusApi;
export { SERVER_STATUS_HISTORY_POLLING, SERVER_STATUS_POLLING };
