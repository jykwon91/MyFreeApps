import { baseApi } from "@platform/core/store/baseApi";
import { LISTING_PAGE_SIZE } from "../constants/listingLabels";
import type { ListingListArgs } from "../types/listing/listing-list-args";
import type { ListingListResponse } from "../types/listing/listing-list-response";
import type { ListingPageArgs } from "../types/listing/listing-page-args";
import type { ListingResponse } from "../types/listing/listing-response";

export const listingsApi = baseApi.enhanceEndpoints({
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
    listListingPages: builder.infiniteQuery<ListingListResponse, ListingPageArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + LISTING_PAGE_SIZE : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/listings",
        params: { ...queryArg, limit: LISTING_PAGE_SIZE, offset: pageParam },
      }),
      providesTags: (result) => [
        ...(result?.pages.flatMap((page) => page.items).map((listing) => ({ type: "Listing" as const, id: listing.id })) ?? []),
        { type: "Listing" as const, id: "LIST" },
      ],
    }),
    getListingById: builder.query<ListingResponse, string>({
      query: (id) => ({ url: `/listings/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Listing", id }],
    }),
  }),
});

export const { useGetListingsQuery, useGetListingByIdQuery, useListListingPagesInfiniteQuery } = listingsApi;
