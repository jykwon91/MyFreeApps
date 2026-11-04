import { baseApi } from "@platform/core/store/baseApi";
import type { ListingListArgs } from "../types/listing/listing-list-args";
import type { ListingListResponse } from "../types/listing/listing-list-response";
import type { ListingResponse } from "../types/listing/listing-response";

const listingsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Listing"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getListings: builder.query<ListingListResponse, ListingListArgs | void>({
      query: (args) => ({
        url: "/listings",
        params: {
          ...(args?.status ? { status: args.status } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((listing) => ({ type: "Listing" as const, id: listing.id })),
              { type: "Listing" as const, id: "LIST" },
            ]
          : [{ type: "Listing" as const, id: "LIST" }],
    }),
    getListingById: builder.query<ListingResponse, string>({
      query: (id) => ({ url: `/listings/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Listing", id }],
    }),
  }),
});

export const { useGetListingsQuery, useGetListingByIdQuery } = listingsApi;
