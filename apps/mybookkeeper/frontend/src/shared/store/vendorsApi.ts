import { baseApi } from "./baseApi";
import type { VendorCreateRequest } from "@/shared/types/vendor/vendor-create-request";
import type { VendorListArgs } from "@/shared/types/vendor/vendor-list-args";
import type { VendorListResponse } from "@/shared/types/vendor/vendor-list-response";
import type { VendorResponse } from "@/shared/types/vendor/vendor-response";
import type { VendorUpdateRequest } from "@/shared/types/vendor/vendor-update-request";

/**
 * RTK Query slice for the Vendors domain (rentals Phase 4).
 *
 * Tag strategy mirrors ``applicantsApi``: each item carries its own
 * ``Vendor:{id}`` tag plus a single shared ``Vendor:LIST`` tag for the
 * paginated list. PR 4.2 adds ``createVendor`` / ``updateVendor`` /
 * ``deleteVendor`` mutations and invalidates ``Transaction:LIST`` on
 * delete because vendor deletion clears ``Transaction.vendor_id`` rows.
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
    createVendor: builder.mutation<VendorResponse, VendorCreateRequest>({
      query: (body) => ({ url: "/vendors", method: "POST", data: body }),
      invalidatesTags: [{ type: "Vendor", id: "LIST" }],
    }),
    updateVendor: builder.mutation<
      VendorResponse,
      { id: string; data: VendorUpdateRequest }
    >({
      query: ({ id, data }) => ({
        url: `/vendors/${id}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Vendor", id: arg.id },
        { type: "Vendor", id: "LIST" },
      ],
    }),
    deleteVendor: builder.mutation<void, string>({
      query: (id) => ({ url: `/vendors/${id}`, method: "DELETE" }),
      // Hard-deleting a vendor clears every linked Transaction.vendor_id —
      // invalidate the Transaction cache so the vendor dropdown rerenders
      // without the gone vendor (and any open transaction edit panel
      // refetches with vendor_id=null).
      invalidatesTags: (_result, _err, id) => [
        { type: "Vendor", id },
        { type: "Vendor", id: "LIST" },
        { type: "Transaction", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetVendorsQuery,
  useGetVendorByIdQuery,
  useCreateVendorMutation,
  useUpdateVendorMutation,
  useDeleteVendorMutation,
} = vendorsApi;
