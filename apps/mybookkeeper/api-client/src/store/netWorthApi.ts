import { baseApi } from "@platform/core/store/baseApi";
import type { NetWorth } from "../types/net-worth/net-worth";
import type { NetWorthHistory } from "../types/net-worth/net-worth-history";
import type { NetWorthRange } from "../types/net-worth/net-worth-range";
import type { PropertyValue } from "../types/net-worth/property-value";
import type { PropertyValueUpdateRequest } from "../types/net-worth/property-value-update-request";

/**
 * Net worth today and its history. Both read accounts, loan records and
 * properties, so they also listen to those lists: a Plaid sync or a balance
 * edit elsewhere refreshes this page without wiring each mutation here.
 */
const NET_WORTH_SOURCE_TAGS = [
  "NetWorth",
  { type: "FinancialAccount", id: "LIST" },
  { type: "Mortgage", id: "LIST" },
  "Property",
] as const;

export const netWorthApi = baseApi.enhanceEndpoints({
  addTagTypes: ["NetWorth", "FinancialAccount", "Mortgage", "Property"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getNetWorth: builder.query<NetWorth, void>({
      query: () => ({ url: "/net-worth" }),
      providesTags: [...NET_WORTH_SOURCE_TAGS],
    }),

    getNetWorthHistory: builder.query<NetWorthHistory, NetWorthRange>({
      query: (range) => ({ url: "/net-worth/history", params: { range } }),
      providesTags: [...NET_WORTH_SOURCE_TAGS],
    }),

    setPropertyEstimatedValue: builder.mutation<PropertyValue, { propertyId: string; data: PropertyValueUpdateRequest }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/estimated-value`, method: "PUT", data }),
      invalidatesTags: ["NetWorth", "Property"],
    }),
  }),
});

export const {
  useGetNetWorthQuery,
  useGetNetWorthHistoryQuery,
  useSetPropertyEstimatedValueMutation,
} = netWorthApi;
