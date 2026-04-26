import { baseApi } from "./baseApi";
import type { OrgWithRole } from "@/shared/types/organization/org-with-role";
import type { Organization } from "@/shared/types/organization/organization";

const organizationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listOrganizations: build.query<OrgWithRole[], void>({
      query: () => ({ url: "/organizations", method: "GET" }),
      providesTags: ["Organization"],
    }),
    createOrganization: build.mutation<Organization, { name: string }>({
      query: (data) => ({ url: "/organizations", method: "POST", data }),
      invalidatesTags: ["Organization"],
    }),
    updateOrganization: build.mutation<Organization, { orgId: string; name: string }>({
      query: ({ orgId, name }) => ({
        url: `/organizations/${orgId}`,
        method: "PATCH",
        data: { name },
      }),
      invalidatesTags: ["Organization"],
    }),
    deleteOrganization: build.mutation<void, string>({
      query: (orgId) => ({ url: `/organizations/${orgId}`, method: "DELETE" }),
      invalidatesTags: ["Organization"],
    }),
  }),
});

export const {
  useListOrganizationsQuery,
  useCreateOrganizationMutation,
  useUpdateOrganizationMutation,
  useDeleteOrganizationMutation,
} = organizationsApi;
