import { baseApi } from "./baseApi";
import type { PlaidItem } from "@/shared/types/plaid/plaid-item";
import type { PlaidAccount } from "@/shared/types/plaid/plaid-account";

const plaidApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createLinkToken: builder.mutation<{ link_token: string }, void>({
      query: () => ({ url: "/plaid/link-token", method: "POST" }),
    }),
    exchangePublicToken: builder.mutation<PlaidItem, { public_token: string }>({
      query: (data) => ({ url: "/plaid/exchange", method: "POST", data }),
      invalidatesTags: ["PlaidItem"],
    }),
    listPlaidItems: builder.query<PlaidItem[], void>({
      query: () => ({ url: "/plaid/items" }),
      providesTags: ["PlaidItem"],
    }),
    getPlaidAccounts: builder.query<PlaidAccount[], string>({
      query: (itemId) => ({ url: `/plaid/items/${itemId}/accounts` }),
      providesTags: (_result, _error, itemId) => [{ type: "PlaidAccount", id: itemId }],
    }),
    updateAccountProperty: builder.mutation<PlaidAccount, { accountId: string; property_id: string | null }>({
      query: ({ accountId, ...data }) => ({ url: `/plaid/accounts/${accountId}`, method: "PATCH", data }),
      invalidatesTags: ["PlaidAccount"],
    }),
    disconnectPlaidItem: builder.mutation<void, string>({
      query: (itemId) => ({ url: `/plaid/items/${itemId}`, method: "DELETE" }),
      invalidatesTags: ["PlaidItem"],
    }),
    syncPlaidItem: builder.mutation<{ status: string; records_added: number }, string>({
      query: (itemId) => ({ url: `/plaid/items/${itemId}/sync`, method: "POST" }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
  }),
});

export const {
  useCreateLinkTokenMutation,
  useExchangePublicTokenMutation,
  useListPlaidItemsQuery,
  useGetPlaidAccountsQuery,
  useUpdateAccountPropertyMutation,
  useDisconnectPlaidItemMutation,
  useSyncPlaidItemMutation,
} = plaidApi;
