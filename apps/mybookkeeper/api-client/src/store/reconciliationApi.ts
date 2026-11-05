import { baseApi } from "@platform/core/store/baseApi";
import type { AutoReconcileResult } from "../types/reconciliation/auto-reconcile-result";
import type { ReconciliationSource } from "../types/reconciliation/reconciliation-source";
import type { Upload1099Request } from "../types/reconciliation/upload-1099-request";

export const reconciliationApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Reconciliation"],
}).injectEndpoints({
  endpoints: (builder) => ({
    upload1099: builder.mutation<ReconciliationSource, Upload1099Request>({
      query: (data) => ({ url: "/reconciliation/upload-1099", method: "POST", data }),
      invalidatesTags: ["Reconciliation"],
    }),
    listSources: builder.query<ReconciliationSource[], { tax_year: number }>({
      query: (params) => ({ url: "/reconciliation/sources", params }),
      providesTags: ["Reconciliation"],
    }),
    getDiscrepancies: builder.query<ReconciliationSource[], { tax_year: number }>({
      query: (params) => ({ url: "/reconciliation/discrepancies", params }),
      providesTags: ["Reconciliation"],
    }),
    autoReconcile: builder.mutation<AutoReconcileResult, { tax_year: number }>({
      query: (params) => ({ url: "/reconciliation/auto-reconcile", method: "POST", params }),
      invalidatesTags: ["Reconciliation"],
    }),
  }),
});

export const {
  useUpload1099Mutation,
  useListSourcesQuery,
  useGetDiscrepanciesQuery,
  useAutoReconcileMutation,
} = reconciliationApi;
