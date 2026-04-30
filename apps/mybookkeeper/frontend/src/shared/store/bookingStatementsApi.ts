import { baseApi } from "./baseApi";
import type { BookingStatement } from "@/shared/types/booking-statement/booking-statement";

export interface OccupancyParams {
  property_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface OccupancyData {
  property_id: string;
  property_name: string;
  total_nights: number;
  occupied_nights: number;
  occupancy_rate: number;
}

const bookingStatementsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listBookingStatements: builder.query<BookingStatement[], { property_id?: string; start_date?: string; end_date?: string }>({
      query: (params = {}) => ({ url: "/booking-statements", params: { ...params } }),
      providesTags: (result) =>
        result
          ? [...result.map((bs) => ({ type: "BookingStatement" as const, id: bs.id })), { type: "BookingStatement", id: "LIST" }]
          : [{ type: "BookingStatement", id: "LIST" }],
    }),
    getOccupancy: builder.query<OccupancyData[], OccupancyParams>({
      query: (params = {}) => ({ url: "/booking-statements/occupancy", params: { ...params } }),
      providesTags: ["BookingStatement"],
    }),
  }),
});

export const {
  useListBookingStatementsQuery,
  useGetOccupancyQuery,
} = bookingStatementsApi;
