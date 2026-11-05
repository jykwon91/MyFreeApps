import { baseApi } from "@platform/core/store/baseApi";
import type { Mortgage } from "../types/mortgage/mortgage";
import type { MortgageListArgs } from "../types/mortgage/mortgage-list-args";
import type { MortgageListResponse } from "../types/mortgage/mortgage-list-response";

export const mortgagesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Mortgage"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getMortgages: builder.query<MortgageListResponse, MortgageListArgs | void>({
      query: (args) => ({
        url: "/mortgages",
        params: {
          ...(args?.property_id ? { property_id: args.property_id } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((mortgage) => ({ type: "Mortgage" as const, id: mortgage.id })),
              { type: "Mortgage" as const, id: "LIST" },
            ]
          : [{ type: "Mortgage" as const, id: "LIST" }],
    }),
    getMortgageById: builder.query<Mortgage, string>({
      query: (id) => ({ url: `/mortgages/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Mortgage", id }],
    }),
  }),
});

export const { useGetMortgagesQuery, useGetMortgageByIdQuery } = mortgagesApi;
