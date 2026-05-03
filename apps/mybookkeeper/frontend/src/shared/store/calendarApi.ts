import { baseApi } from "./baseApi";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import type { CalendarEventsArgs } from "@/shared/types/calendar/calendar-events-args";
import type { ListingBlackoutAttachment } from "@/shared/types/listing/listing-blackout-attachment";
import type { BlackoutUpdateRequest } from "@/shared/types/listing/blackout-update-request";
import type { ReviewQueueItem } from "@/shared/types/calendar/review-queue-item";
import type {
  ResolveQueueItemRequest,
  IgnoreQueueItemRequest,
} from "@/shared/types/calendar/review-queue-requests";

/**
 * Unified calendar viewer API.
 *
 * Read paths: calendar events (with host_notes + attachment_count), attachments list.
 * Write paths: update blackout notes, upload attachment, delete attachment.
 *
 * Cache invalidation strategy:
 * - Updating notes or uploading/deleting an attachment invalidates the Calendar
 *   LIST (so event-bar indicators re-render) and the per-blackout attachment list.
 */
const calendarApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCalendarEvents: builder.query<CalendarEvent[], CalendarEventsArgs | void>({
      query: (args) => ({
        url: "/calendar/events",
        params: {
          ...(args?.from ? { from: args.from } : {}),
          ...(args?.to ? { to: args.to } : {}),
          ...(args?.listing_ids && args.listing_ids.length > 0
            ? { listing_ids: args.listing_ids.join(",") }
            : {}),
          ...(args?.property_ids && args.property_ids.length > 0
            ? { property_ids: args.property_ids.join(",") }
            : {}),
          ...(args?.sources && args.sources.length > 0
            ? { sources: args.sources.join(",") }
            : {}),
        },
      }),
      providesTags: [{ type: "Calendar", id: "LIST" }],
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

    getBlackoutAttachments: builder.query<
      ListingBlackoutAttachment[],
      string
    >({
      query: (blackoutId) => ({ url: `/listings/blackouts/${blackoutId}/attachments` }),
      providesTags: (_result, _err, blackoutId) => [
        { type: "BlackoutAttachments", id: blackoutId },
      ],
    }),

    uploadBlackoutAttachment: builder.mutation<
      ListingBlackoutAttachment,
      { blackoutId: string; file: File }
    >({
      query: ({ blackoutId, file }) => {
        const formData = new FormData();
        formData.append("file", file);
        return {
          url: `/listings/blackouts/${blackoutId}/attachments`,
          method: "POST",
          data: formData,
        };
      },
      invalidatesTags: (_result, _err, { blackoutId }) => [
        { type: "Calendar", id: "LIST" },
        { type: "BlackoutAttachments", id: blackoutId },
      ],
    }),

    deleteBlackoutAttachment: builder.mutation<
      void,
      { blackoutId: string; attachmentId: string }
    >({
      query: ({ blackoutId, attachmentId }) => ({
        url: `/listings/blackouts/${blackoutId}/attachments/${attachmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, { blackoutId }) => [
        { type: "Calendar", id: "LIST" },
        { type: "BlackoutAttachments", id: blackoutId },
      ],
    }),

    // -----------------------------------------------------------------------
    // Phase 2 — booking review queue
    // -----------------------------------------------------------------------

    getReviewQueue: builder.query<ReviewQueueItem[], void>({
      query: () => ({ url: "/calendar/review-queue" }),
      providesTags: [{ type: "ReviewQueue", id: "LIST" }],
    }),

    getReviewQueueCount: builder.query<number, void>({
      query: () => ({ url: "/calendar/review-queue/count" }),
      providesTags: [{ type: "ReviewQueue", id: "COUNT" }],
    }),

    resolveQueueItem: builder.mutation<
      ReviewQueueItem,
      { itemId: string; body: ResolveQueueItemRequest }
    >({
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

    ignoreQueueItem: builder.mutation<
      ReviewQueueItem,
      { itemId: string; body: IgnoreQueueItemRequest }
    >({
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
  useUpdateBlackoutMutation,
  useGetBlackoutAttachmentsQuery,
  useUploadBlackoutAttachmentMutation,
  useDeleteBlackoutAttachmentMutation,
  useGetReviewQueueQuery,
  useGetReviewQueueCountQuery,
  useResolveQueueItemMutation,
  useIgnoreQueueItemMutation,
  useDismissQueueItemMutation,
} = calendarApi;
