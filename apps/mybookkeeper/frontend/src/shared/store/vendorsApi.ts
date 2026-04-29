import { baseApi } from "./baseApi";
import type { VendorListArgs } from "@/shared/types/vendor/vendor-list-args";
import type { VendorListResponse } from "@/shared/types/vendor/vendor-list-response";
import type { VendorResponse } from "@/shared/types/vendor/vendor-response";

/**
 * RTK Query slice for the Vendors domain (rentals Phase 4).
 *
 * Tag strategy mirrors ``applicantsApi``: each item carries its own
 * ``Vendor:{id}`` tag plus a single shared ``Vendor:LIST`` tag for the
 * paginated list. Write endpoints (create / update / soft-delete) land in
 * PR 4.2; this PR ships read-only queries.
 */
const vendorsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getVendors: builder.query<VendorListResponse, VendorListArgs | void>({
      query: (args) => ({
        url: "/vendors",
        params: {
          ...(args?.category ? { category: args.category } : {}),
          ...(args?.preferred !== undefined ? { preferred: args.preferred } : {}),
          ...(args?.include_deleted !== undefined
            ? { include_deleted: args.include_deleted }
            : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((vendor) => ({
                type: "Vendor" as const,
                id: vendor.id,
              })),
              { type: "Vendor" as const, id: "LIST" },
            ]
          : [{ type: "Vendor" as const, id: "LIST" }],
    }),
    getVendorById: builder.query<VendorResponse, string>({
      query: (id) => ({ url: `/vendors/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Vendor", id }],
    }),
  }),
});

export const { useGetVendorsQuery, useGetVendorByIdQuery } = vendorsApi;
