import { baseApi } from "@platform/ui";
import type { CharacterCompletedQuests } from "@/games/wow-forever/types/character/characterCompletedQuests";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

export const wowCharacterApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCharacter: build.query<CharacterResponse, string>({
      query: (slug) => ({ url: `/wow/characters/${encodeURIComponent(slug)}`, method: "GET" }),
    }),
    getCompletedQuests: build.query<CharacterCompletedQuests, string>({
      query: (slug) => ({ url: `/wow/characters/${encodeURIComponent(slug)}/quests/completed`, method: "GET" }),
    }),
  }),
});

export const { useGetCharacterQuery, useGetCompletedQuestsQuery } = wowCharacterApi;
