import { baseApi } from "@platform/ui";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus";

/** Poll interval: 90 s while the tab is focused. */
const SERVER_STATUS_POLLING = {
  pollingInterval: 90_000,
  skipPollingIfUnfocused: true,
} as const;

const wowServerStatusApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getServerStatus: build.query<ServerStatusResponse, string>({
      query: (region) => ({ url: `/wow/server-status?region=${region}`, method: "GET" }),
    }),
  }),
});

export const { useGetServerStatusQuery } = wowServerStatusApi;
export { SERVER_STATUS_POLLING };
