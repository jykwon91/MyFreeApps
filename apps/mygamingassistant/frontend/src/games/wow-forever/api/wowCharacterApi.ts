import { baseApi } from "@platform/ui";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

export const wowCharacterApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCharacter: build.query<CharacterResponse, string>({
      query: (slug) => ({ url: `/wow/characters/${encodeURIComponent(slug)}`, method: "GET" }),
    }),
  }),
});

export const { useGetCharacterQuery } = wowCharacterApi;
