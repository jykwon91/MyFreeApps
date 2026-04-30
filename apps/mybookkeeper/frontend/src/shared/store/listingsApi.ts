import { baseApi } from "./baseApi";
import type { Channel } from "@/shared/types/listing/channel";
import type { ChannelListing } from "@/shared/types/listing/channel-listing";
import type { ChannelListingCreateRequest } from "@/shared/types/listing/channel-listing-create-request";
import type { ChannelListingUpdateRequest } from "@/shared/types/listing/channel-listing-update-request";
import type { ListingCreateRequest } from "@/shared/types/listing/listing-create-request";
import type { ListingExternalId } from "@/shared/types/listing/listing-external-id";
import type { ListingExternalIdCreateRequest } from "@/shared/types/listing/listing-external-id-create-request";
import type { ListingExternalIdUpdateRequest } from "@/shared/types/listing/listing-external-id-update-request";
import type { ListingListArgs } from "@/shared/types/listing/listing-list-args";
import type { ListingListResponse } from "@/shared/types/listing/listing-list-response";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";
import type { ListingResponse } from "@/shared/types/listing/listing-response";
import type { ListingUpdateRequest } from "@/shared/types/listing/listing-update-request";

const listingsApi = baseApi.injectEndpoints({
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
    createListing: builder.mutation<ListingResponse, ListingCreateRequest>({
      query: (body) => ({ url: "/listings", method: "POST", data: body }),
      invalidatesTags: [{ type: "Listing", id: "LIST" }],
    }),
    updateListing: builder.mutation<
      ListingResponse,
      { id: string; data: ListingUpdateRequest }
    >({
      query: ({ id, data }) => ({ url: `/listings/${id}`, method: "PUT", data }),
      invalidatesTags: (result, _err, arg) => [
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
    uploadListingPhotos: builder.mutation<
      ListingPhoto[],
      { listingId: string; files: File[] }
    >({
      query: ({ listingId, files }) => {
        const form = new FormData();
        for (const f of files) {
          form.append("files", f);
        }
        return {
          url: `/listings/${listingId}/photos`,
          method: "POST",
          data: form,
        };
      },
      invalidatesTags: (_result, _err, arg) => [
        { type: "Listing", id: arg.listingId },
      ],
    }),
    deleteListingPhoto: builder.mutation<
      void,
      { listingId: string; photoId: string }
    >({
      query: ({ listingId, photoId }) => ({
        url: `/listings/${listingId}/photos/${photoId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Listing", id: arg.listingId },
      ],
    }),
    updateListingPhoto: builder.mutation<
      ListingPhoto,
      {
        listingId: string;
        photoId: string;
        caption?: string | null;
        display_order?: number;
      }
    >({
      query: ({ listingId, photoId, caption, display_order }) => ({
        url: `/listings/${listingId}/photos/${photoId}`,
        method: "PATCH",
        data: {
          ...(caption !== undefined ? { caption } : {}),
          ...(display_order !== undefined ? { display_order } : {}),
        },
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Listing", id: arg.listingId },
      ],
    }),
    createListingExternalId: builder.mutation<
      ListingExternalId,
      { listingId: string; data: ListingExternalIdCreateRequest }
    >({
      query: ({ listingId, data }) => ({
        url: `/listings/${listingId}/external-ids`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Listing", id: arg.listingId },
      ],
    }),
    updateListingExternalId: builder.mutation<
      ListingExternalId,
      {
        listingId: string;
        externalIdPk: string;
        data: ListingExternalIdUpdateRequest;
      }
    >({
      query: ({ listingId, externalIdPk, data }) => ({
        url: `/listings/${listingId}/external-ids/${externalIdPk}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Listing", id: arg.listingId },
      ],
    }),
    deleteListingExternalId: builder.mutation<
      void,
      { listingId: string; externalIdPk: string }
    >({
      query: ({ listingId, externalIdPk }) => ({
        url: `/listings/${listingId}/external-ids/${externalIdPk}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Listing", id: arg.listingId },
      ],
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
    createListingChannel: builder.mutation<
      ChannelListing,
      { listingId: string; data: ChannelListingCreateRequest }
    >({
      query: ({ listingId, data }) => ({
        url: `/listings/${listingId}/channels`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "ChannelListing", id: `LISTING-${arg.listingId}` },
      ],
    }),
    updateChannelListing: builder.mutation<
      ChannelListing,
      {
        listingId: string;
        channelListingId: string;
        data: ChannelListingUpdateRequest;
      }
    >({
      query: ({ channelListingId, data }) => ({
        url: `/channel-listings/${channelListingId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "ChannelListing", id: arg.channelListingId },
        { type: "ChannelListing", id: `LISTING-${arg.listingId}` },
      ],
    }),
    deleteChannelListing: builder.mutation<
      void,
      { listingId: string; channelListingId: string }
    >({
      query: ({ channelListingId }) => ({
        url: `/channel-listings/${channelListingId}`,
        method: "DELETE",
      }),
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
  useCreateListingMutation,
  useUpdateListingMutation,
  useDeleteListingMutation,
  useUploadListingPhotosMutation,
  useDeleteListingPhotoMutation,
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
