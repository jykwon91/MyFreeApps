import { baseApi } from "@platform/ui";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

export const wowGuildApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getGuild: build.query<GuildResponse, string>({
      query: (slug) => ({ url: `/wow/guilds/${encodeURIComponent(slug)}`, method: "GET" }),
    }),
  }),
});

export const { useGetGuildQuery } = wowGuildApi;
