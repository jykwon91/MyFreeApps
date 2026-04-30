import { baseApi } from "./baseApi";
import type { ReconciliationSource, ReconciliationMatch } from "@/shared/types/reconciliation/reconciliation-source";

export type Discrepancy = ReconciliationSource;

interface Upload1099Args {
  source_type: string;
  tax_year: number;
  issuer?: string;
  reported_amount: string;
}

const reconciliationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    upload1099: builder.mutation<ReconciliationSource, Upload1099Args>({
      query: (data) => ({ url: "/reconciliation/upload-1099", method: "POST", data }),
      invalidatesTags: ["Reconciliation"],
    }),
    listSources: builder.query<ReconciliationSource[], { tax_year?: number }>({
      query: (params = {}) => ({ url: "/reconciliation/sources", params: { ...params } }),
      providesTags: (result) =>
        result
          ? [...result.map((s) => ({ type: "Reconciliation" as const, id: s.id })), { type: "Reconciliation", id: "LIST" }]
          : [{ type: "Reconciliation", id: "LIST" }],
    }),
    getDiscrepancies: builder.query<Discrepancy[], { tax_year?: number }>({
      query: (params = {}) => ({ url: "/reconciliation/discrepancies", params: { ...params } }),
      providesTags: ["Reconciliation"],
    }),
    createMatch: builder.mutation<ReconciliationMatch, { reconciliation_source_id: string; booking_statement_id: string; matched_amount: string }>({
      query: (data) => ({ url: "/reconciliation/match", method: "POST", data }),
      invalidatesTags: ["Reconciliation"],
    }),
  }),
});

export const {
  useUpload1099Mutation,
  useListSourcesQuery,
  useGetDiscrepanciesQuery,
  useCreateMatchMutation,
} = reconciliationApi;
