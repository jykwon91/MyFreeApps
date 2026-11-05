import { baseApi } from "@platform/core/store/baseApi";
import type { InviteInfo } from "../types/organization/InviteInfo";
import type { OrgInvite } from "../types/organization/OrgInvite";
import type { OrgMember } from "../types/organization/OrgMember";
import type { OrgRole } from "../types/organization/OrgRole";

export const membersApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Members", "Invites", "Organization"],
}).injectEndpoints({
  endpoints: (build) => ({
    listMembers: build.query<OrgMember[], string>({
      query: (orgId) => ({ url: `/organizations/${orgId}/members`, method: "GET" }),
      providesTags: ["Members"],
    }),
    updateMemberRole: build.mutation<OrgMember, { orgId: string; userId: string; orgRole: OrgRole }>({
      query: ({ orgId, userId, orgRole }) => ({
        url: `/organizations/${orgId}/members/${userId}/role`,
        method: "PATCH",
        data: { org_role: orgRole },
      }),
      invalidatesTags: ["Members"],
    }),
    removeMember: build.mutation<void, { orgId: string; userId: string }>({
      query: ({ orgId, userId }) => ({
        url: `/organizations/${orgId}/members/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Members"],
    }),
    createInvite: build.mutation<OrgInvite, { orgId: string; email: string; orgRole: OrgRole }>({
      query: ({ orgId, email, orgRole }) => ({
        url: `/organizations/${orgId}/invites`,
        method: "POST",
        data: { email, org_role: orgRole },
      }),
      invalidatesTags: ["Invites"],
    }),
    listInvites: build.query<OrgInvite[], string>({
      query: (orgId) => ({ url: `/organizations/${orgId}/invites`, method: "GET" }),
      providesTags: ["Invites"],
    }),
    cancelInvite: build.mutation<void, { orgId: string; inviteId: string }>({
      query: ({ orgId, inviteId }) => ({
        url: `/organizations/${orgId}/invites/${inviteId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Invites"],
    }),
    acceptInvite: build.mutation<{ organization_id: string; org_role: string }, string>({
      query: (token) => ({
        url: `/organizations/invites/${token}/accept`,
        method: "POST",
      }),
      invalidatesTags: ["Organization"],
    }),
    getInviteInfo: build.query<InviteInfo, string>({
      query: (token) => ({ url: `/organizations/invites/${token}/info`, method: "GET" }),
    }),
  }),
});

export const {
  useListMembersQuery,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useCreateInviteMutation,
  useListInvitesQuery,
  useCancelInviteMutation,
  useAcceptInviteMutation,
  useGetInviteInfoQuery,
} = membersApi;
