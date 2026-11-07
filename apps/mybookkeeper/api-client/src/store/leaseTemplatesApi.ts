import { baseApi } from "@platform/core/store/baseApi";
import type { LeaseTemplateDetail } from "../types/lease/lease-template-detail";
import type { LeaseTemplateListResponse } from "../types/lease/lease-template-list-response";
import type { MultiGenerateDefaultsRequest } from "../types/lease/multi-generate-defaults-request";
import type { MultiGenerateDefaultsResponse } from "../types/lease/multi-generate-defaults-response";
import { localToday } from "../utils/localToday";

export const leaseTemplatesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["LeaseTemplate"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getLeaseTemplates: builder.query<LeaseTemplateListResponse, { limit?: number; offset?: number } | void>({
      query: (args) => ({
        url: "/lease-templates",
        params: {
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((template) => ({ type: "LeaseTemplate" as const, id: template.id })),
              { type: "LeaseTemplate" as const, id: "LIST" },
            ]
          : [{ type: "LeaseTemplate" as const, id: "LIST" }],
    }),
    getLeaseTemplateById: builder.query<LeaseTemplateDetail, string>({
      query: (id) => ({ url: `/lease-templates/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "LeaseTemplate", id }],
    }),
    getMultiGenerateDefaults: builder.query<MultiGenerateDefaultsResponse, Omit<MultiGenerateDefaultsRequest, "today">>({
      query: (args) => {
        const body: MultiGenerateDefaultsRequest = { ...args, today: localToday() };
        return { url: "/lease-templates/generate-defaults", method: "POST", data: body };
      },
    }),
  }),
});

export const {
  useGetLeaseTemplatesQuery,
  useGetLeaseTemplateByIdQuery,
  useLazyGetLeaseTemplateByIdQuery,
  useGetMultiGenerateDefaultsQuery,
} = leaseTemplatesApi;
