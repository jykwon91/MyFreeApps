import { baseApi } from "@platform/ui";
import type { ServiceDashboardPayload, OrderStatus } from "@/types/service/service";

const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["ServiceDashboard"],
});

const serviceApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    getDashboard: build.query<ServiceDashboardPayload, string>({
      query: (dropId) => ({
        url: `/service/drops/${dropId}`,
        method: "GET",
      }),
      providesTags: (_result, _err, dropId) => [
        { type: "ServiceDashboard", id: dropId },
      ],
    }),
    advanceOrder: build.mutation<
      { id: string; status: OrderStatus; slot_id: string },
      { dropId: string; orderId: string; targetStatus: OrderStatus }
    >({
      query: ({ orderId, targetStatus }) => ({
        url: `/service/orders/${orderId}/advance`,
        method: "POST",
        data: { target_status: targetStatus },
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "ServiceDashboard", id: dropId },
      ],
    }),
    moveOrder: build.mutation<
      { id: string; slot_id: string },
      { dropId: string; orderId: string; slotId: string }
    >({
      query: ({ orderId, slotId }) => ({
        url: `/service/orders/${orderId}/move`,
        method: "POST",
        data: { slot_id: slotId },
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "ServiceDashboard", id: dropId },
      ],
    }),
  }),
});

export const {
  useGetDashboardQuery,
  useAdvanceOrderMutation,
  useMoveOrderMutation,
} = serviceApi;
