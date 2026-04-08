import { baseApi } from "./baseApi";
import type { Document } from "@/shared/types/document/document";

export interface UploadResponse {
  document_id: string;
  batch_id: string | null;
  batch_total: number;
}

export interface BatchStatusResponse {
  batch_id: string;
  total: number;
  completed: number;
  failed: number;
  status: "processing" | "done";
}

export interface SingleStatusResponse {
  status: string;
}

const documentsApi = baseApi.injectEndpoints({
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
    uploadDocument: builder.mutation<UploadResponse, { file: File; propertyId?: string }>({
      query: ({ file, propertyId }) => {
        const form = new FormData();
        form.append("file", file);
        if (propertyId) form.append("property_id", propertyId);
        return { url: "/documents/upload", method: "POST", data: form };
      },
      invalidatesTags: ["Document"],
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
      invalidatesTags: ["Document"],
    }),
    bulkDeleteDocuments: builder.mutation<{ deleted: number }, string[]>({
      query: (ids) => ({ url: "/documents/bulk-delete", method: "POST", data: { ids } }),
      invalidatesTags: ["Document"],
    }),
    replaceFile: builder.mutation<{ status: string }, { id: string; file: File }>({
      query: ({ id, file }) => {
        const form = new FormData();
        form.append("file", file);
        return { url: `/documents/${id}/file`, method: "PUT", data: form };
      },
      invalidatesTags: ["Document"],
    }),
    reExtractDocument: builder.mutation<{ status: string }, string>({
      query: (id) => ({ url: `/documents/${id}/re-extract`, method: "POST" }),
      invalidatesTags: ["Document"],
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
      invalidatesTags: ["Document", "Transaction"],
    }),
    cancelBatch: builder.mutation<{ cancelled: number }, string>({
      query: (batchId) => ({ url: `/documents/batch-cancel/${batchId}`, method: "POST" }),
      invalidatesTags: ["Document"],
    }),
  }),
});

export const {
  useGetDocumentsQuery,
  useUploadDocumentMutation,
  useGetBatchStatusQuery,
  useGetSingleUploadStatusQuery,
  useDeleteDocumentMutation,
  useBulkDeleteDocumentsMutation,
  useReExtractDocumentMutation,
  useReplaceFileMutation,
  useToggleEscrowPaidMutation,
  useCancelBatchMutation,
} = documentsApi;
