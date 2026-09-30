import { baseApi } from "@platform/ui";
import type { Language } from "@/types/catalog/language";
import type { Scenario } from "@/types/catalog/scenario";

// Read-only catalog: supported languages + the scenario learning path.
// Both come from static backend registries, so no tags / invalidation.
const catalogApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listLanguages: build.query<Language[], void>({
      query: () => ({ url: "/languages", method: "GET" }),
    }),
    listScenarios: build.query<Scenario[], string>({
      query: (language) => ({
        url: "/scenarios",
        method: "GET",
        params: { language },
      }),
    }),
  }),
});

export const { useListLanguagesQuery, useListScenariosQuery } = catalogApi;
