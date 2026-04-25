import { baseApi } from "./baseApi";
import type { Reservation } from "@/shared/types/reservation/reservation";

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

const reservationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listReservations: builder.query<Reservation[], { property_id?: string; start_date?: string; end_date?: string }>({
      query: (params = {}) => ({ url: "/reservations", params: { ...params } }),
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "Reservation" as const, id: r.id })), { type: "Reservation", id: "LIST" }]
          : [{ type: "Reservation", id: "LIST" }],
    }),
    getOccupancy: builder.query<OccupancyData[], OccupancyParams>({
      query: (params = {}) => ({ url: "/reservations/occupancy", params: { ...params } }),
      providesTags: ["Reservation"],
    }),
  }),
});

export const {
  useListReservationsQuery,
  useGetOccupancyQuery,
} = reservationsApi;
