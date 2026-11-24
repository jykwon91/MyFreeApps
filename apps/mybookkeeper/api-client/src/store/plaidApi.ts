import { baseApi } from "@platform/core/store/baseApi";
import type { PlaidItem } from "../types/plaid/plaid-item";
import type { PlaidItemCreateRequest } from "../types/plaid/plaid-item-create-request";
import type { PlaidLinkTokenRequest } from "../types/plaid/plaid-link-token-request";
import type { PlaidLinkTokenResponse } from "../types/plaid/plaid-link-token-response";
import type { PlaidSyncResult } from "../types/plaid/plaid-sync-result";

/**
 * Bank connections through Plaid. Connecting, syncing and disconnecting
 * change which accounts are synced and add transactions, so they refresh the
 * account and transaction lists too.
 */
export const plaidApi = baseApi.enhanceEndpoints({
  addTagTypes: ["PlaidItem", "FinancialAccount", "Transaction"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listPlaidItems: builder.query<PlaidItem[], void>({
      query: () => ({ url: "/plaid/items" }),
      providesTags: [{ type: "PlaidItem", id: "LIST" }],
    }),

    createPlaidLinkToken: builder.mutation<PlaidLinkTokenResponse, PlaidLinkTokenRequest>({
      query: (data) => ({ url: "/plaid/link-token", method: "POST", data }),
    }),

    connectPlaidItem: builder.mutation<PlaidItem, PlaidItemCreateRequest>({
      query: (data) => ({ url: "/plaid/items", method: "POST", data }),
      invalidatesTags: [{ type: "PlaidItem", id: "LIST" }, { type: "FinancialAccount", id: "LIST" }],
    }),

    syncPlaidItem: builder.mutation<PlaidSyncResult, string>({
      query: (itemId) => ({ url: `/plaid/items/${itemId}/sync`, method: "POST" }),
      invalidatesTags: [{ type: "PlaidItem", id: "LIST" }, { type: "FinancialAccount", id: "LIST" }, "Transaction"],
    }),

    markPlaidItemReconnected: builder.mutation<PlaidItem, string>({
      query: (itemId) => ({ url: `/plaid/items/${itemId}/reconnected`, method: "POST" }),
      invalidatesTags: [{ type: "PlaidItem", id: "LIST" }],
    }),

    disconnectPlaidItem: builder.mutation<void, string>({
      query: (itemId) => ({ url: `/plaid/items/${itemId}`, method: "DELETE" }),
      invalidatesTags: [{ type: "PlaidItem", id: "LIST" }, { type: "FinancialAccount", id: "LIST" }],
    }),
  }),
});

export const {
  useListPlaidItemsQuery,
  useCreatePlaidLinkTokenMutation,
  useConnectPlaidItemMutation,
  useSyncPlaidItemMutation,
  useMarkPlaidItemReconnectedMutation,
  useDisconnectPlaidItemMutation,
} = plaidApi;
