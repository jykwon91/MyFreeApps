import { baseApi } from "@platform/core/store/baseApi";
import type { InsurancePolicyDetail } from "../types/insurance/insurance-policy-detail";
import type { InsurancePolicyListArgs } from "../types/insurance/insurance-policy-list-args";
import type { InsurancePolicyListResponse } from "../types/insurance/insurance-policy-list-response";

export const insurancePoliciesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["InsurancePolicy"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getInsurancePolicies: builder.query<InsurancePolicyListResponse, InsurancePolicyListArgs | void>({
      query: (args) => ({
        url: "/insurance-policies",
        params: {
          ...(args?.property_id ? { property_id: args.property_id } : {}),
          ...(args?.expiring_before ? { expiring_before: args.expiring_before } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((policy) => ({ type: "InsurancePolicy" as const, id: policy.id })),
              { type: "InsurancePolicy" as const, id: "LIST" },
            ]
          : [{ type: "InsurancePolicy" as const, id: "LIST" }],
    }),
    getInsurancePolicyById: builder.query<InsurancePolicyDetail, string>({
      query: (id) => ({ url: `/insurance-policies/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "InsurancePolicy", id }],
    }),
  }),
});

export const {
  useGetInsurancePoliciesQuery,
  useGetInsurancePolicyByIdQuery,
  useLazyGetInsurancePolicyByIdQuery,
} = insurancePoliciesApi;
