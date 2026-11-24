import { baseApi } from "@platform/core/store/baseApi";
import type { Holding } from "../types/investments/holding";
import type { HoldingCreateRequest } from "../types/investments/holding-create-request";
import type { HoldingList } from "../types/investments/holding-list";
import type { HoldingUpdateRequest } from "../types/investments/holding-update-request";

/**
 * The Investments page. A hand-kept account's balance is its holdings' total,
 * so every write refreshes the accounts and net worth too. The list also
 * listens to the accounts and bank connections, so a bank sync or an account
 * rename elsewhere refreshes it.
 */
export const holdingsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Holding", "FinancialAccount", "PlaidItem", "NetWorth"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listHoldings: builder.query<HoldingList, string | null>({
      query: (accountId) => ({
        url: "/holdings",
        params: accountId === null ? undefined : { financial_account_id: accountId },
      }),
      providesTags: [
        { type: "Holding", id: "LIST" },
        { type: "FinancialAccount", id: "LIST" },
        { type: "PlaidItem", id: "LIST" },
      ],
    }),

    createHolding: builder.mutation<Holding, HoldingCreateRequest>({
      query: (data) => ({ url: "/holdings", method: "POST", data }),
      invalidatesTags: [{ type: "Holding", id: "LIST" }, { type: "FinancialAccount", id: "LIST" }, "NetWorth"],
    }),

    updateHolding: builder.mutation<Holding, { holdingId: string; data: HoldingUpdateRequest }>({
      query: ({ holdingId, data }) => ({ url: `/holdings/${holdingId}`, method: "PATCH", data }),
      invalidatesTags: [{ type: "Holding", id: "LIST" }, { type: "FinancialAccount", id: "LIST" }, "NetWorth"],
    }),

    deleteHolding: builder.mutation<void, string>({
      query: (holdingId) => ({ url: `/holdings/${holdingId}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Holding", id: "LIST" }, { type: "FinancialAccount", id: "LIST" }, "NetWorth"],
    }),
  }),
});

export const {
  useListHoldingsQuery,
  useCreateHoldingMutation,
  useUpdateHoldingMutation,
  useDeleteHoldingMutation,
} = holdingsApi;
