import { baseApi } from "@platform/ui";
import type { GuildRefreshResponse } from "@/games/wow-forever/types/guild/guildRefreshResponse";
import type { GuildRecipeSearch } from "@/games/wow-forever/types/guild/guildRecipeSearch";
import type { GuildRecipeSearchArgs } from "@/games/wow-forever/types/guild/guildRecipeSearchArgs";
import type { GuildReputations } from "@/games/wow-forever/types/guild/guildReputations";
import type { GuildReputationsArgs } from "@/games/wow-forever/types/guild/guildReputationsArgs";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

export const wowGuildApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getGuild: build.query<GuildResponse, string>({
      query: (slug) => ({ url: `/wow/guilds/${encodeURIComponent(slug)}`, method: "GET" }),
    }),
    refreshGuild: build.mutation<GuildRefreshResponse, string>({
      query: (slug) => ({ url: `/wow/guilds/${encodeURIComponent(slug)}/refresh`, method: "POST" }),
    }),
    searchGuildRecipes: build.query<GuildRecipeSearch, GuildRecipeSearchArgs>({
      query: ({ slug, query }) => ({
        url: `/wow/guilds/${encodeURIComponent(slug)}/recipes`,
        method: "GET",
        params: { q: query },
      }),
    }),
    getGuildReputations: build.query<GuildReputations, GuildReputationsArgs>({
      query: ({ slug, faction }) => ({
        url: `/wow/guilds/${encodeURIComponent(slug)}/reputations`,
        method: "GET",
        params: faction === null ? {} : { faction },
      }),
    }),
  }),
});

export const {
  useGetGuildQuery,
  useRefreshGuildMutation,
  useSearchGuildRecipesQuery,
  useGetGuildReputationsQuery,
} = wowGuildApi;
