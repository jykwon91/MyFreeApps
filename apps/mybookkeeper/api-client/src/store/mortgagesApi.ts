import { baseApi } from "@platform/core/store/baseApi";
import { MORTGAGE_UPLOAD_TIMEOUT_MS } from "../constants/mortgageUpload";
import type { Mortgage } from "../types/mortgage/mortgage";
import type { MortgageCreateRequest } from "../types/mortgage/mortgage-create-request";
import type { MortgageDraft } from "../types/mortgage/mortgage-draft";
import type { MortgageListArgs } from "../types/mortgage/mortgage-list-args";
import type { MortgageListResponse } from "../types/mortgage/mortgage-list-response";
import type { MortgageUpdateRequest } from "../types/mortgage/mortgage-update-request";

/**
 * Mortgages: reads, writes and the statement reader. Web and phone share it.
 *
 * Tag strategy mirrors insurancePoliciesApi: per-id ``Mortgage:{id}`` plus a
 * shared ``Mortgage:LIST``. Every write also invalidates ``Mortgage:RATE_WATCH``
 * since editing a rate or a balance changes the answer the market section gave,
 * and leaving a stale verdict on screen next to the corrected loan is worse
 * than showing nothing.
 */
export const mortgagesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Mortgage", "Document"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getMortgages: builder.query<MortgageListResponse, MortgageListArgs | void>({
      query: (args) => ({
        url: "/mortgages",
        params: {
          ...(args?.property_id ? { property_id: args.property_id } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((mortgage) => ({ type: "Mortgage" as const, id: mortgage.id })),
              { type: "Mortgage" as const, id: "LIST" },
            ]
          : [{ type: "Mortgage" as const, id: "LIST" }],
    }),
    getMortgageById: builder.query<Mortgage, string>({
      query: (id) => ({ url: `/mortgages/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Mortgage", id }],
    }),

    createMortgage: builder.mutation<Mortgage, MortgageCreateRequest>({
      query: (data) => ({ url: "/mortgages", method: "POST", data }),
      invalidatesTags: [
        { type: "Mortgage", id: "LIST" },
        { type: "Mortgage", id: "RATE_WATCH" },
      ],
    }),

    updateMortgage: builder.mutation<Mortgage, { mortgageId: string; data: MortgageUpdateRequest }>({
      query: ({ mortgageId, data }) => ({
        url: `/mortgages/${mortgageId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_r, _e, { mortgageId }) => [
        { type: "Mortgage", id: mortgageId },
        { type: "Mortgage", id: "LIST" },
        { type: "Mortgage", id: "RATE_WATCH" },
      ],
    }),

    deleteMortgage: builder.mutation<void, string>({
      query: (id) => ({ url: `/mortgages/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Mortgage", id },
        { type: "Mortgage", id: "LIST" },
        { type: "Mortgage", id: "RATE_WATCH" },
      ],
    }),

    /**
     * Read loan terms out of an already-uploaded statement.
     *
     * A mutation rather than a query despite saving nothing: it is a paid model
     * call the operator triggers deliberately, and caching it under the
     * document id would silently return a stale reading after the file is
     * replaced. It invalidates nothing since no row changed.
     */
    extractMortgage: builder.mutation<MortgageDraft, { document_id: string }>({
      query: (data) => ({ url: "/mortgages/extract", method: "POST", data }),
    }),

    /**
     * Read loan terms out of a file the operator has on the device.
     *
     * The caller builds the ``FormData`` (web and phone build file parts
     * differently). The upload half does save a row, since the statement lands
     * in the document library as reference material, hence the ``Document``
     * invalidation. It is stored reference-only, so the payment printed on it is
     * never booked as an expense that did not happen.
     */
    extractMortgageFromUpload: builder.mutation<MortgageDraft, FormData>({
      query: (form) => ({
        url: "/mortgages/extract-upload",
        method: "POST",
        data: form,
        timeout: MORTGAGE_UPLOAD_TIMEOUT_MS,
      }),
      invalidatesTags: ["Document"],
    }),
  }),
});

export const {
  useGetMortgagesQuery,
  useGetMortgageByIdQuery,
  useCreateMortgageMutation,
  useUpdateMortgageMutation,
  useDeleteMortgageMutation,
  useExtractMortgageMutation,
  useExtractMortgageFromUploadMutation,
} = mortgagesApi;
