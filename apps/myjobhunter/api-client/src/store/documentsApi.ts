import { baseApi } from "@platform/core/store/baseApi";
import type { Document } from "../types/document/document";
import type { DocumentCreateRequest } from "../types/document/document-create-request";
import type { DocumentListResponse } from "../types/document/document-list-response";
import type { DocumentUpdateRequest } from "../types/document/document-update-request";
import type { DocumentsFilter } from "../types/document/documents-filter";
import { DOCUMENTS_PAGE_SIZE, FIRST_DOCUMENTS_OFFSET } from "../constants/documentsPaging";
import { getNextPageOffset } from "@platform/core/utils/getNextPageOffset";
import { withoutDocument } from "../utils/withoutDocument";

const DOCUMENTS_TAG = "Documents";

const documentsApi = baseApi
  .enhanceEndpoints({ addTagTypes: [DOCUMENTS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      /**
       * GET /documents, one page per offset. The filter keys the cache, so a new
       * filter starts again from the first page. `fetchNextPage` loads the next
       * one; there is none once every matching document is loaded. Refetching
       * (invalidation, focus, pull to refresh) reloads every loaded page.
       */
      listDocuments: build.infiniteQuery<DocumentListResponse, DocumentsFilter, number>({
        infiniteQueryOptions: {
          initialPageParam: FIRST_DOCUMENTS_OFFSET,
          getNextPageParam: (lastPage, _allPages, lastOffset) => getNextPageOffset(lastPage, lastOffset),
        },
        query: ({ queryArg, pageParam }) => ({
          url: "/documents",
          method: "GET",
          params: {
            application_id: queryArg.application_id || undefined,
            kind: queryArg.kind || undefined,
            limit: DOCUMENTS_PAGE_SIZE,
            offset: pageParam,
          },
        }),
        providesTags: (result) =>
          result
            ? [
                ...result.pages.flatMap((page) => page.items.map(({ id }) => ({ type: DOCUMENTS_TAG, id }) as const)),
                { type: DOCUMENTS_TAG, id: "LIST" } as const,
              ]
            : [{ type: DOCUMENTS_TAG, id: "LIST" } as const],
      }),

      getDocument: build.query<Document, string>({
        query: (id) => ({ url: `/documents/${id}`, method: "GET" }),
        providesTags: (_result, _err, id) => [{ type: DOCUMENTS_TAG, id }],
      }),

      createDocument: build.mutation<Document, DocumentCreateRequest>({
        query: (body) => ({ url: "/documents", method: "POST", data: body }),
        invalidatesTags: [{ type: DOCUMENTS_TAG, id: "LIST" }],
      }),

      // The caller fills the form with fillDocumentUploadForm: a browser appends a File, a phone a { uri, name, type }.
      uploadDocument: build.mutation<Document, FormData>({
        query: (form) => ({ url: "/documents/upload", method: "POST", data: form }),
        invalidatesTags: [{ type: DOCUMENTS_TAG, id: "LIST" }],
      }),

      updateDocument: build.mutation<Document, { id: string; patch: DocumentUpdateRequest }>({
        query: ({ id, patch }) => ({
          url: `/documents/${id}`,
          method: "PATCH",
          data: patch,
        }),
        invalidatesTags: (_result, _err, { id }) => [
          { type: DOCUMENTS_TAG, id },
          { type: DOCUMENTS_TAG, id: "LIST" },
        ],
      }),

      deleteDocument: build.mutation<void, string>({
        query: (id) => ({ url: `/documents/${id}`, method: "DELETE" }),
        // Once the server confirms, every loaded list drops it from whichever page holds it
        // and lowers its total, at once. The reload of every loaded page the invalidation
        // starts then realigns the pages, and if that reload fails the list still doesn't
        // show a document that's gone.
        async onQueryStarted(id, { dispatch, getState, queryFulfilled }) {
          try {
            await queryFulfilled;
          } catch {
            return;
          }
          for (const { endpointName, originalArgs } of documentsApi.util.selectInvalidatedBy(getState(), [{ type: DOCUMENTS_TAG, id }])) {
            if (endpointName !== "listDocuments") continue;
            dispatch(documentsApi.util.updateQueryData("listDocuments", originalArgs as DocumentsFilter, (pages) => withoutDocument(pages, id)));
          }
        },
        invalidatesTags: (_result, _err, id) => [
          { type: DOCUMENTS_TAG, id },
          { type: DOCUMENTS_TAG, id: "LIST" },
        ],
      }),

      getDocumentDownloadUrl: build.query<{ url: string }, string>({
        query: (id) => ({ url: `/documents/${id}/download`, method: "GET" }),
        // Never cache the presigned URL — it expires after 1 hour.
        keepUnusedDataFor: 0,
      }),
    }),
  });

export const {
  useListDocumentsInfiniteQuery,
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useUploadDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
  useGetDocumentDownloadUrlQuery,
  useLazyGetDocumentDownloadUrlQuery,
} = documentsApi;
