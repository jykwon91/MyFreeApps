import { baseApi } from "@platform/core/store/baseApi";
import { LISTING_PAGE_SIZE } from "../constants/listingLabels";
import { LISTING_PHOTO_UPLOAD_TIMEOUT_MS } from "../constants/listingPhotos";
import type { Channel } from "../types/listing/channel";
import type { ChannelListing } from "../types/listing/channel-listing";
import type { ChannelListingCreateRequest } from "../types/listing/channel-listing-create-request";
import type { ChannelListingUpdateRequest } from "../types/listing/channel-listing-update-request";
import type { ListingCreateRequest } from "../types/listing/listing-create-request";
import type { ListingExternalId } from "../types/listing/listing-external-id";
import type { ListingExternalIdCreateRequest } from "../types/listing/listing-external-id-create-request";
import type { ListingExternalIdUpdateRequest } from "../types/listing/listing-external-id-update-request";
import type { ListingPhoto } from "../types/listing/listing-photo";
import type { ListingPhotoDeleteArgs } from "../types/listing/listing-photo-delete-args";
import type { ListingPhotoOrderArgs } from "../types/listing/listing-photo-order-args";
import type { ListingPhotoUpdateArgs } from "../types/listing/listing-photo-update-args";
import type { ListingUpdateRequest } from "../types/listing/listing-update-request";
import type { ListingListArgs } from "../types/listing/listing-list-args";
import type { ListingListResponse } from "../types/listing/listing-list-response";
import type { ListingPageArgs } from "../types/listing/listing-page-args";
import type { ListingResponse } from "../types/listing/listing-response";

export const listingsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Listing", "Channel", "ChannelListing"],
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
    createListing: builder.mutation<ListingResponse, ListingCreateRequest>({
      query: (body) => ({ url: "/listings", method: "POST", data: body }),
      invalidatesTags: [{ type: "Listing", id: "LIST" }],
    }),
    updateListing: builder.mutation<ListingResponse, { id: string; data: ListingUpdateRequest }>({
      query: ({ id, data }) => ({ url: `/listings/${id}`, method: "PUT", data }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Listing", id: arg.id },
        { type: "Listing", id: "LIST" },
      ],
    }),
    deleteListing: builder.mutation<void, string>({
      query: (id) => ({ url: `/listings/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "Listing", id },
        { type: "Listing", id: "LIST" },
      ],
    }),
    /** The caller's form carries one or more `files` parts. The server refuses the whole batch if one file is bad. */
    uploadListingPhotos: builder.mutation<ListingPhoto[], { listingId: string; form: FormData }>({
      query: ({ listingId, form }) => ({
        url: `/listings/${listingId}/photos`,
        method: "POST",
        data: form,
        timeout: LISTING_PHOTO_UPLOAD_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _err, arg) => [{ type: "Listing", id: arg.listingId }],
    }),
    deleteListingPhoto: builder.mutation<void, ListingPhotoDeleteArgs>({
      query: ({ listingId, photoId }) => ({ url: `/listings/${listingId}/photos/${photoId}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, arg) => (arg.refresh === false ? [] : [{ type: "Listing", id: arg.listingId }]),
    }),
    /** Sets the whole order in one transaction on the server, so it can't be left half-applied. */
    reorderListingPhotos: builder.mutation<ListingPhoto[], ListingPhotoOrderArgs>({
      query: ({ listingId, photoIds }) => ({ url: `/listings/${listingId}/photos/order`, method: "PUT", data: { photo_ids: photoIds } }),
      invalidatesTags: (_result, _err, arg) => [{ type: "Listing", id: arg.listingId }],
    }),
    updateListingPhoto: builder.mutation<ListingPhoto, ListingPhotoUpdateArgs>({
      query: ({ listingId, photoId, caption, display_order }) => ({
        url: `/listings/${listingId}/photos/${photoId}`,
        method: "PATCH",
        data: {
          ...(caption !== undefined ? { caption } : {}),
          ...(display_order !== undefined ? { display_order } : {}),
        },
      }),
      invalidatesTags: (_result, _err, arg) => [{ type: "Listing", id: arg.listingId }],
    }),
    createListingExternalId: builder.mutation<ListingExternalId, { listingId: string; data: ListingExternalIdCreateRequest }>({
      query: ({ listingId, data }) => ({ url: `/listings/${listingId}/external-ids`, method: "POST", data }),
      invalidatesTags: (_result, _err, arg) => [{ type: "Listing", id: arg.listingId }],
    }),
    updateListingExternalId: builder.mutation<
      ListingExternalId,
      { listingId: string; externalIdPk: string; data: ListingExternalIdUpdateRequest }
    >({
      query: ({ listingId, externalIdPk, data }) => ({
        url: `/listings/${listingId}/external-ids/${externalIdPk}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [{ type: "Listing", id: arg.listingId }],
    }),
    deleteListingExternalId: builder.mutation<void, { listingId: string; externalIdPk: string }>({
      query: ({ listingId, externalIdPk }) => ({
        url: `/listings/${listingId}/external-ids/${externalIdPk}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, arg) => [{ type: "Listing", id: arg.listingId }],
    }),
    getChannels: builder.query<Channel[], void>({
      query: () => ({ url: "/channels" }),
      providesTags: [{ type: "Channel", id: "LIST" }],
    }),
    getListingChannels: builder.query<ChannelListing[], string>({
      query: (listingId) => ({ url: `/listings/${listingId}/channels` }),
      providesTags: (result, _err, listingId) =>
        result
          ? [
              ...result.map((cl) => ({ type: "ChannelListing" as const, id: cl.id })),
              { type: "ChannelListing" as const, id: `LISTING-${listingId}` },
            ]
          : [{ type: "ChannelListing" as const, id: `LISTING-${listingId}` }],
    }),
    createListingChannel: builder.mutation<ChannelListing, { listingId: string; data: ChannelListingCreateRequest }>({
      query: ({ listingId, data }) => ({ url: `/listings/${listingId}/channels`, method: "POST", data }),
      invalidatesTags: (_result, _err, arg) => [{ type: "ChannelListing", id: `LISTING-${arg.listingId}` }],
    }),
    updateChannelListing: builder.mutation<
      ChannelListing,
      { listingId: string; channelListingId: string; data: ChannelListingUpdateRequest }
    >({
      query: ({ channelListingId, data }) => ({ url: `/channel-listings/${channelListingId}`, method: "PATCH", data }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "ChannelListing", id: arg.channelListingId },
        { type: "ChannelListing", id: `LISTING-${arg.listingId}` },
      ],
    }),
    deleteChannelListing: builder.mutation<void, { listingId: string; channelListingId: string }>({
      query: ({ channelListingId }) => ({ url: `/channel-listings/${channelListingId}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "ChannelListing", id: arg.channelListingId },
        { type: "ChannelListing", id: `LISTING-${arg.listingId}` },
      ],
    }),
  }),
});

export const {
  useGetListingsQuery,
  useGetListingByIdQuery,
  useListListingPagesInfiniteQuery,
  useCreateListingMutation,
  useUpdateListingMutation,
  useDeleteListingMutation,
  useUploadListingPhotosMutation,
  useDeleteListingPhotoMutation,
  useReorderListingPhotosMutation,
  useUpdateListingPhotoMutation,
  useCreateListingExternalIdMutation,
  useUpdateListingExternalIdMutation,
  useDeleteListingExternalIdMutation,
  useGetChannelsQuery,
  useGetListingChannelsQuery,
  useCreateListingChannelMutation,
  useUpdateChannelListingMutation,
  useDeleteChannelListingMutation,
} = listingsApi;
