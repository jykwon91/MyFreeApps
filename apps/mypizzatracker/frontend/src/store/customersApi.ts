import { baseApi } from "@platform/ui";
import type {
  CustomerListItem,
  CustomerNotesUpdate,
  CustomerRead,
} from "@/types/customer/customer";

const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["Customer"],
});

const customersApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    listCustomers: build.query<CustomerListItem[], { search?: string } | void>({
      query: (arg) => ({
        url: "/customers",
        method: "GET",
        params: arg?.search ? { search: arg.search } : undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((c) => ({ type: "Customer" as const, id: c.id })),
              { type: "Customer" as const, id: "LIST" },
            ]
          : [{ type: "Customer" as const, id: "LIST" }],
    }),
    updateCustomerNotes: build.mutation<
      CustomerRead,
      { customerId: string; body: CustomerNotesUpdate }
    >({
      query: ({ customerId, body }) => ({
        url: `/customers/${customerId}/notes`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_result, _err, { customerId }) => [
        { type: "Customer", id: customerId },
        { type: "Customer", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListCustomersQuery,
  useUpdateCustomerNotesMutation,
} = customersApi;
