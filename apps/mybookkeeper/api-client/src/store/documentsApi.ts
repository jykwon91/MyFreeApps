import { baseApi } from "@platform/core/store/baseApi";
import type { BatchStatusResponse } from "../types/document/BatchStatusResponse";
import type { BulkDeleteDocumentsResponse } from "../types/document/BulkDeleteDocumentsResponse";
import type { Document } from "../types/document/document";
import type { SingleStatusResponse } from "../types/document/SingleStatusResponse";
import type { UploadResponse } from "../types/document/UploadResponse";

export const documentsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Document", "Summary", "Transaction"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getDocuments: builder.query<Document[], { status?: string; propertyId?: string; excludeProcessing?: boolean }>({
      query: ({ status, propertyId, excludeProcessing } = {}) => ({
        url: "/documents",
        params: { status, property_id: propertyId, exclude_processing: excludeProcessing || undefined },
      }),
      providesTags: (result) =>
        result
          ? [...result.map((d) => ({ type: "Document" as const, id: d.id })), { type: "Document", id: "LIST" }]
          : [{ type: "Document", id: "LIST" }],
    }),
    // The caller builds the form: a browser appends a File, a phone a { uri, name, type }.
    uploadDocument: builder.mutation<UploadResponse, FormData>({
      query: (form) => ({ url: "/documents/upload", method: "POST", data: form }),
      invalidatesTags: ["Document", "Summary", "Transaction"],
    }),
    getBatchStatus: builder.query<BatchStatusResponse, string>({
      query: (batchId) => ({ url: `/documents/batch-status/${batchId}` }),
    }),
    getSingleUploadStatus: builder.query<SingleStatusResponse, string>({
      query: (docId) => ({ url: `/documents/upload-status/${docId}` }),
    }),
    getDocument: builder.query<Document, string>({
      query: (id) => ({ url: `/documents/${id}` }),
      providesTags: (_result, _err, id) => [{ type: "Document", id }],
    }),
    deleteDocument: builder.mutation<void, string>({
      query: (id) => ({ url: `/documents/${id}`, method: "DELETE" }),
      invalidatesTags: ["Document", "Summary", "Transaction"],
    }),
    bulkDeleteDocuments: builder.mutation<BulkDeleteDocumentsResponse, string[]>({
      query: (ids) => ({ url: "/documents/bulk-delete", method: "POST", data: { ids } }),
      invalidatesTags: ["Document", "Summary", "Transaction"],
    }),
    reExtractDocument: builder.mutation<{ status: string }, string>({
      query: (id) => ({ url: `/documents/${id}/re-extract`, method: "POST" }),
      invalidatesTags: ["Document", "Summary", "Transaction"],
    }),
    toggleEscrowPaid: builder.mutation<
      { is_escrow_paid: boolean; transactions_removed: number },
      { id: string; is_escrow_paid: boolean }
    >({
      query: ({ id, is_escrow_paid }) => ({
        url: `/documents/${id}/escrow-paid`,
        method: "PATCH",
        data: { is_escrow_paid },
      }),
      invalidatesTags: ["Document", "Transaction", "Summary"],
    }),
    cancelBatch: builder.mutation<{ cancelled: number }, string>({
      query: (batchId) => ({ url: `/documents/batch-cancel/${batchId}`, method: "POST" }),
      invalidatesTags: ["Document", "Summary", "Transaction"],
    }),
  }),
});

export const {
  useGetDocumentsQuery,
  useUploadDocumentMutation,
  useGetBatchStatusQuery,
  useGetSingleUploadStatusQuery,
  useGetDocumentQuery,
  useDeleteDocumentMutation,
  useBulkDeleteDocumentsMutation,
  useReExtractDocumentMutation,
  useToggleEscrowPaidMutation,
  useCancelBatchMutation,
} = documentsApi;
