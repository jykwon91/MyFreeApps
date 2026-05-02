import { baseApi } from "./baseApi";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import type { CalendarEventsArgs } from "@/shared/types/calendar/calendar-events-args";

/**
 * Unified calendar viewer API.
 *
 * Single read-only endpoint — the calendar is a viewer, not an editor.
 * Filter arrays serialise as comma-separated CSVs to match the backend
 * `?listing_ids=a,b,c` shape.
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
  }),
});

export const { useGetCalendarEventsQuery } = calendarApi;
