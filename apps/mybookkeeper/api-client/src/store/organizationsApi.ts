import { baseApi } from "@platform/core/store/baseApi";
import type { Organization } from "../types/organization/Organization";
import type { OrganizationCreate } from "../types/organization/OrganizationCreate";
import type { OrgWithRole } from "../types/organization/OrgWithRole";

export const organizationsApi = baseApi.enhanceEndpoints({ addTagTypes: ["Organization"] }).injectEndpoints({
  endpoints: (build) => ({
    listOrganizations: build.query<OrgWithRole[], void>({
      query: () => ({ url: "/organizations", method: "GET" }),
      providesTags: ["Organization"],
    }),
    /** Send the name trimmed, after `organizationNameProblem` passes it. The creator becomes its owner. */
    createOrganization: build.mutation<Organization, OrganizationCreate>({
      query: (data) => ({ url: "/organizations", method: "POST", data }),
      invalidatesTags: ["Organization"],
    }),
  }),
});

export const { useListOrganizationsQuery, useCreateOrganizationMutation } = organizationsApi;
