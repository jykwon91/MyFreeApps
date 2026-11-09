import { baseApi } from "@platform/core/store/baseApi";
import { BLACKOUT_ATTACHMENT_UPLOAD_TIMEOUT_MS } from "../constants/blackoutAttachments";
import type { BlackoutUpdateRequest } from "../types/calendar/blackout-update-request";
import type { CalendarEvent } from "../types/calendar/calendar-event";
import type { CalendarEventsArgs } from "../types/calendar/calendar-events-args";
import type { IgnoreQueueItemRequest } from "../types/calendar/ignore-queue-item-request";
import type { ListingBlackoutAttachment } from "../types/calendar/listing-blackout-attachment";
import type { ResolveQueueItemRequest } from "../types/calendar/resolve-queue-item-request";
import type { ResolveQueueItemResponse } from "../types/calendar/resolve-queue-item-response";
import type { ReviewQueueItem } from "../types/calendar/review-queue-item";

/**
 * The unified calendar: events, notes and attachments on a booking, and the
 * booking review queue. Web and phone both use it.
 *
 * Updating notes or uploading/deleting an attachment invalidates the Calendar
 * LIST (so indicators re-render) and the per-blackout attachment list.
 */

export const calendarApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Calendar", "ReviewQueue", "BlackoutAttachments"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getCalendarEvents: builder.query<CalendarEvent[], CalendarEventsArgs>({
      query: (args) => ({
        url: "/calendar/events",
        params: {
          from: args.from,
          to: args.to,
          ...(args.listing_ids && args.listing_ids.length > 0
            ? { listing_ids: args.listing_ids.join(",") }
            : {}),
          ...(args.property_ids && args.property_ids.length > 0
            ? { property_ids: args.property_ids.join(",") }
            : {}),
          ...(args.sources && args.sources.length > 0
            ? { sources: args.sources.join(",") }
            : {}),
        },
      }),
      providesTags: [{ type: "Calendar", id: "LIST" }],
    }),

    getReviewQueueCount: builder.query<number, void>({
      query: () => ({ url: "/calendar/review-queue/count" }),
      providesTags: [{ type: "ReviewQueue", id: "COUNT" }],
    }),

    updateBlackout: builder.mutation<
      { id: string; host_notes: string | null },
      { blackoutId: string; body: BlackoutUpdateRequest }
    >({
      query: ({ blackoutId, body }) => ({
        url: `/listings/blackouts/${blackoutId}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: [{ type: "Calendar", id: "LIST" }],
    }),

    getBlackoutAttachments: builder.query<ListingBlackoutAttachment[], string>({
      query: (blackoutId) => ({ url: `/listings/blackouts/${blackoutId}/attachments` }),
      providesTags: (_result, _err, blackoutId) => [{ type: "BlackoutAttachments", id: blackoutId }],
    }),

    uploadBlackoutAttachment: builder.mutation<ListingBlackoutAttachment, { blackoutId: string; form: FormData }>({
      query: ({ blackoutId, form }) => ({
        url: `/listings/blackouts/${blackoutId}/attachments`,
        method: "POST",
        data: form,
        timeout: BLACKOUT_ATTACHMENT_UPLOAD_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _err, { blackoutId }) => [
        { type: "Calendar", id: "LIST" },
        { type: "BlackoutAttachments", id: blackoutId },
      ],
    }),

    deleteBlackoutAttachment: builder.mutation<void, { blackoutId: string; attachmentId: string }>({
      query: ({ blackoutId, attachmentId }) => ({
        url: `/listings/blackouts/${blackoutId}/attachments/${attachmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, { blackoutId }) => [
        { type: "Calendar", id: "LIST" },
        { type: "BlackoutAttachments", id: blackoutId },
      ],
    }),

    getReviewQueue: builder.query<ReviewQueueItem[], void>({
      query: () => ({ url: "/calendar/review-queue" }),
      providesTags: [{ type: "ReviewQueue", id: "LIST" }],
    }),

    resolveQueueItem: builder.mutation<ResolveQueueItemResponse, { itemId: string; body: ResolveQueueItemRequest }>({
      query: ({ itemId, body }) => ({
        url: `/calendar/review-queue/${itemId}/resolve`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: [
        { type: "ReviewQueue", id: "LIST" },
        { type: "ReviewQueue", id: "COUNT" },
        { type: "Calendar", id: "LIST" },
      ],
    }),

    ignoreQueueItem: builder.mutation<ReviewQueueItem, { itemId: string; body: IgnoreQueueItemRequest }>({
      query: ({ itemId, body }) => ({
        url: `/calendar/review-queue/${itemId}/ignore`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: [
        { type: "ReviewQueue", id: "LIST" },
        { type: "ReviewQueue", id: "COUNT" },
      ],
    }),

    dismissQueueItem: builder.mutation<void, string>({
      query: (itemId) => ({
        url: `/calendar/review-queue/${itemId}`,
        method: "DELETE",
      }),
      invalidatesTags: [
        { type: "ReviewQueue", id: "LIST" },
        { type: "ReviewQueue", id: "COUNT" },
      ],
    }),
  }),
});

export const {
  useGetCalendarEventsQuery,
  useGetReviewQueueCountQuery,
  useUpdateBlackoutMutation,
  useGetBlackoutAttachmentsQuery,
  useLazyGetBlackoutAttachmentsQuery,
  useUploadBlackoutAttachmentMutation,
  useDeleteBlackoutAttachmentMutation,
  useGetReviewQueueQuery,
  useResolveQueueItemMutation,
  useIgnoreQueueItemMutation,
  useDismissQueueItemMutation,
} = calendarApi;
