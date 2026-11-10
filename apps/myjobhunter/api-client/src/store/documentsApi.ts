import { baseApi } from "@platform/core/store/baseApi";
import type { Document } from "../types/document/document";
import type { DocumentCreateRequest } from "../types/document/document-create-request";
import type { DocumentListResponse } from "../types/document/document-list-response";
import type { DocumentUpdateRequest } from "../types/document/document-update-request";
import type { DocumentsFilter } from "../types/document/documents-filter";

const DOCUMENTS_TAG = "Documents";

const documentsApi = baseApi
  .enhanceEndpoints({ addTagTypes: [DOCUMENTS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      listDocuments: build.query<DocumentListResponse, DocumentsFilter | void>({
        query: (filter) => ({
          url: "/documents",
          method: "GET",
          params: {
            application_id: filter?.application_id || undefined,
            kind: filter?.kind || undefined,
          },
        }),
        providesTags: (result) =>
          result
            ? [
                ...result.items.map(({ id }) => ({ type: DOCUMENTS_TAG, id }) as const),
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

      // The caller builds the form: a browser appends a File, a phone a { uri, name, type }.
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
  useListDocumentsQuery,
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useUploadDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
  useGetDocumentDownloadUrlQuery,
} = documentsApi;
