import { baseApi } from "./baseApi";
import type { Mortgage } from "@/shared/types/mortgage/mortgage";
import type { MortgageCreateRequest } from "@/shared/types/mortgage/mortgage-create-request";
import type { MortgageDraft } from "@/shared/types/mortgage/mortgage-draft";
import type { MortgageListResponse } from "@/shared/types/mortgage/mortgage-list-response";
import type { MortgageUpdateRequest } from "@/shared/types/mortgage/mortgage-update-request";

export interface MortgageListArgs {
  property_id?: string;
  limit?: number;
  offset?: number;
}

/**
 * RTK Query slice for the Mortgages domain.
 *
 * Tag strategy mirrors insurancePoliciesApi: per-id ``Mortgage:{id}`` plus a
 * shared ``Mortgage:LIST``. Every write also invalidates ``Mortgage:RATE_WATCH``
 * — editing a rate or a balance changes the answer the market section gave, and
 * leaving a stale verdict on screen next to the corrected loan is worse than
 * showing nothing.
 */
const mortgagesApi = baseApi.injectEndpoints({
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
              ...result.items.map((m) => ({
                type: "Mortgage" as const,
                id: m.id,
              })),
              { type: "Mortgage" as const, id: "LIST" },
            ]
          : [{ type: "Mortgage" as const, id: "LIST" }],
    }),

    createMortgage: builder.mutation<Mortgage, MortgageCreateRequest>({
      query: (data) => ({ url: "/mortgages", method: "POST", data }),
      invalidatesTags: [
        { type: "Mortgage", id: "LIST" },
        { type: "Mortgage", id: "RATE_WATCH" },
      ],
    }),

    updateMortgage: builder.mutation<
      Mortgage,
      { mortgageId: string; data: MortgageUpdateRequest }
    >({
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
      invalidatesTags: [
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
     * replaced. It invalidates nothing — no row changed.
     */
    extractMortgage: builder.mutation<MortgageDraft, { document_id: string }>({
      query: (data) => ({ url: "/mortgages/extract", method: "POST", data }),
    }),

    /**
     * Read loan terms out of a file the operator has on the device.
     *
     * The upload half does save a row — the statement lands in the document
     * library as reference material so the loan can cite it — hence the
     * ``Document`` invalidation its sibling above does not need. It is stored
     * reference-only, so the payment printed on it is never booked as an
     * expense that did not happen.
     */
    extractMortgageFromUpload: builder.mutation<MortgageDraft, File>({
      query: (file) => {
        const form = new FormData();
        form.append("file", file);
        return {
          url: "/mortgages/extract-upload",
          method: "POST",
          data: form,
        };
      },
      invalidatesTags: ["Document"],
    }),
  }),
});

export const {
  useGetMortgagesQuery,
  useCreateMortgageMutation,
  useUpdateMortgageMutation,
  useDeleteMortgageMutation,
  useExtractMortgageMutation,
  useExtractMortgageFromUploadMutation,
} = mortgagesApi;
