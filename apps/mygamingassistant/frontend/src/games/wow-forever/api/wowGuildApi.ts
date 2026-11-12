import { baseApi } from "@platform/ui";
import type { GuildRecipeSearch } from "@/games/wow-forever/types/guild/guildRecipeSearch";
import type { GuildRecipeSearchArgs } from "@/games/wow-forever/types/guild/guildRecipeSearchArgs";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

export const wowGuildApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getGuild: build.query<GuildResponse, string>({
      query: (slug) => ({ url: `/wow/guilds/${encodeURIComponent(slug)}`, method: "GET" }),
    }),
    searchGuildRecipes: build.query<GuildRecipeSearch, GuildRecipeSearchArgs>({
      query: ({ slug, query }) => ({
        url: `/wow/guilds/${encodeURIComponent(slug)}/recipes`,
        method: "GET",
        params: { q: query },
      }),
    }),
  }),
});

export const { useGetGuildQuery, useSearchGuildRecipesQuery } = wowGuildApi;
