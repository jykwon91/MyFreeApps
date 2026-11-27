import { baseApi } from "@platform/core/store/baseApi";
import type { PersonalFinances } from "../types/personal-finances/personal-finances";
import type { PersonalFinancesQuery } from "../types/personal-finances/personal-finances-query";

/**
 * The personal finances page. Built from transactions (and payee tags, which
 * invalidate the transaction list), so it reloads with them.
 */
export const personalFinancesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Transaction", "CashFlow"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getPersonalFinances: builder.query<PersonalFinances, PersonalFinancesQuery>({
      query: ({ start, end }) => ({
        url: "/personal-finances",
        params: { ...(start === null ? {} : { start }), ...(end === null ? {} : { end }) },
      }),
      providesTags: ["CashFlow", { type: "Transaction", id: "LIST" }],
    }),
  }),
});

export const { useGetPersonalFinancesQuery } = personalFinancesApi;
