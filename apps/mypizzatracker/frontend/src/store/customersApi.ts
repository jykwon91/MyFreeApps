import { baseApi } from "@platform/ui";
import { CUSTOMER_PAGE_SIZE } from "@/constants/customers";
import type { CustomerNotesUpdate, CustomerRead } from "@/types/customer/customer";
import type { CustomerListResponse } from "@/types/customer/customer-list-response";
import type { CustomerPageArgs } from "@/types/customer/customer-page-args";

const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["Customer"],
});

const customersApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    listCustomerPages: build.infiniteQuery<CustomerListResponse, CustomerPageArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + CUSTOMER_PAGE_SIZE : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/customers",
        method: "GET",
        params: {
          ...(queryArg.search ? { search: queryArg.search } : {}),
          limit: CUSTOMER_PAGE_SIZE,
          offset: pageParam,
        },
      }),
      providesTags: (result) => [
        ...(result?.pages.flatMap((page) => page.items).map((c) => ({ type: "Customer" as const, id: c.id })) ?? []),
        { type: "Customer" as const, id: "LIST" },
      ],
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
  useListCustomerPagesInfiniteQuery,
  useUpdateCustomerNotesMutation,
} = customersApi;
