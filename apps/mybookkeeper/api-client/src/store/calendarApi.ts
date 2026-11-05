import { baseApi } from "@platform/core/store/baseApi";
import type { CalendarEvent } from "../types/calendar/calendar-event";
import type { CalendarEventsArgs } from "../types/calendar/calendar-events-args";

export const calendarApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Calendar", "ReviewQueue"],
}).injectEndpoints({
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

    getReviewQueueCount: builder.query<number, void>({
      query: () => ({ url: "/calendar/review-queue/count" }),
      providesTags: [{ type: "ReviewQueue", id: "COUNT" }],
    }),
  }),
});

export const { useGetCalendarEventsQuery, useGetReviewQueueCountQuery } = calendarApi;
