import { UPLOAD_REQUEST_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { ORGANIZATION_HEADER } from "@platform/core/constants/organizationHeader";
import { baseApi } from "@platform/core/store/baseApi";
import { DOCUMENT_PAGE_SIZE } from "../constants/documentPaging";
import { DOCUMENT_REMOVAL_TAGS } from "../constants/documentRemovalTags";
import type { BatchStatusResponse } from "../types/document/BatchStatusResponse";
import type { BulkDeleteDocumentsResponse } from "../types/document/BulkDeleteDocumentsResponse";
import type { Document } from "../types/document/document";
import type { DocumentListPage } from "../types/document/DocumentListPage";
import type { DocumentPageArgs } from "../types/document/DocumentPageArgs";
import type { DocumentSelectionRef } from "../types/document/DocumentSelectionRef";
import type { DocumentSummary } from "../types/document/DocumentSummary";
import type { SingleStatusResponse } from "../types/document/SingleStatusResponse";
import type { UploadDocumentArgs } from "../types/document/UploadDocumentArgs";
import type { UploadResponse } from "../types/document/UploadResponse";
import { documentFilterQuery, documentListQuery } from "../utils/documentListQuery";
import { pathWithQuery } from "../utils/pathWithQuery";

export const documentsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Document", "Summary", "Transaction", "SignedLease", "TaxReturn"],
}).injectEndpoints({
  endpoints: (builder) => ({
    // Unpaged and bounded by the server: only for a narrow subset, like the documents still processing.
    // A list that must reach every document pages through listDocumentPages.
    getDocuments: builder.query<Document[], { status: string }>({
      query: ({ status }) => ({ url: "/documents", params: { status } }),
      providesTags: (result) =>
        result
          ? [...result.map((d) => ({ type: "Document" as const, id: d.id })), { type: "Document", id: "LIST" }]
          : [{ type: "Document", id: "LIST" }],
    }),
    listDocumentPages: builder.infiniteQuery<DocumentListPage, DocumentPageArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + DOCUMENT_PAGE_SIZE : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: pathWithQuery(
          "/documents/page",
          `${documentListQuery(queryArg)}&limit=${DOCUMENT_PAGE_SIZE}&offset=${pageParam}`,
        ),
      }),
      providesTags: (result) => [
        ...(result?.pages.flatMap((page) => page.items).map((d) => ({ type: "Document" as const, id: d.id })) ?? []),
        { type: "Document" as const, id: "LIST" },
      ],
    }),
    // Every document the filters match, so "select all" can tick ones not loaded yet. Fetched only when
    // triggered (select all, or checking ticks), so it provides no tag: a delete would otherwise refetch
    // every matching id for as long as the lazy query stays subscribed.
    listDocumentSelection: builder.query<DocumentSelectionRef[], DocumentPageArgs>({
      query: (args) => ({ url: pathWithQuery("/documents/selection", documentFilterQuery(args)) }),
    }),
    // Counts for Home. Tagged as a Document so whatever refreshes the list refreshes this too.
    getDocumentSummary: builder.query<DocumentSummary, void>({
      query: () => ({ url: "/documents/summary" }),
      providesTags: [{ type: "Document", id: "SUMMARY" }],
    }),
    uploadDocument: builder.mutation<UploadResponse, UploadDocumentArgs>({
      query: ({ form, workspaceId, onUploadProgress }) => ({
        url: "/documents/upload",
        method: "POST",
        data: form,
        headers: workspaceId ? { [ORGANIZATION_HEADER]: workspaceId } : undefined,
        timeout: UPLOAD_REQUEST_TIMEOUT_MS,
        onUploadProgress,
      }),
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
      invalidatesTags: [...DOCUMENT_REMOVAL_TAGS],
    }),
    bulkDeleteDocuments: builder.mutation<BulkDeleteDocumentsResponse, string[]>({
      query: (ids) => ({ url: "/documents/bulk-delete", method: "POST", data: { ids } }),
      invalidatesTags: [...DOCUMENT_REMOVAL_TAGS],
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
      // Marking reference-only soft-deletes the document's payments (set_escrow_paid), dismissing their pending receipts and flagging unfiled returns.
      invalidatesTags: [...DOCUMENT_REMOVAL_TAGS],
    }),
    cancelBatch: builder.mutation<{ cancelled: number }, string>({
      query: (batchId) => ({ url: `/documents/batch-cancel/${batchId}`, method: "POST" }),
      invalidatesTags: ["Document", "Summary", "Transaction"],
    }),
  }),
});

export const {
  useGetDocumentsQuery,
  useListDocumentPagesInfiniteQuery,
  useLazyListDocumentSelectionQuery,
  useGetDocumentSummaryQuery,
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
