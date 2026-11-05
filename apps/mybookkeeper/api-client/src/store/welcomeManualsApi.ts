import { baseApi } from "@platform/core/store/baseApi";
import type { WelcomeManualListArgs } from "../types/welcome-manual/welcome-manual-list-args";
import type { WelcomeManualListResponse } from "../types/welcome-manual/welcome-manual-list-response";
import type { WelcomeManualResponse } from "../types/welcome-manual/welcome-manual-response";

export const welcomeManualsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["WelcomeManual"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getWelcomeManuals: builder.query<WelcomeManualListResponse, WelcomeManualListArgs | void>({
      query: (args) => ({
        url: "/welcome-manuals",
        params: {
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((manual) => ({ type: "WelcomeManual" as const, id: manual.id })),
              { type: "WelcomeManual" as const, id: "LIST" },
            ]
          : [{ type: "WelcomeManual" as const, id: "LIST" }],
    }),
    getWelcomeManualById: builder.query<WelcomeManualResponse, string>({
      query: (id) => ({ url: `/welcome-manuals/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "WelcomeManual", id }],
    }),
  }),
});

export const { useGetWelcomeManualsQuery, useGetWelcomeManualByIdQuery } = welcomeManualsApi;
