import { baseApi } from "@platform/ui";
import type { Invite } from "@/types/invite/invite";
import type { InviteAcceptResponse } from "@/types/invite/invite-accept-response";
import type { InviteCreateRequest } from "@/types/invite/invite-create-request";
import type { InviteInfo } from "@/types/invite/invite-info";

// Cache tag for invite list — invalidated on create/cancel/accept.
const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["Invite"],
});

const invitesApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    listInvites: build.query<Invite[], void>({
      query: () => ({ url: "/admin/invites", method: "GET" }),
      providesTags: ["Invite"],
    }),
    createInvite: build.mutation<Invite, InviteCreateRequest>({
      query: (data) => ({ url: "/admin/invites", method: "POST", data }),
      invalidatesTags: ["Invite"],
    }),
    cancelInvite: build.mutation<void, string>({
      query: (inviteId) => ({
        url: `/admin/invites/${inviteId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Invite"],
    }),
    getInviteInfo: build.query<InviteInfo, string>({
      query: (token) => ({ url: `/invites/${token}/info`, method: "GET" }),
    }),
    acceptInvite: build.mutation<InviteAcceptResponse, string>({
      query: (token) => ({
        url: `/invites/${token}/accept`,
        method: "POST",
      }),
      invalidatesTags: ["Invite"],
    }),
  }),
});

export const {
  useListInvitesQuery,
  useCreateInviteMutation,
  useCancelInviteMutation,
  useGetInviteInfoQuery,
  useAcceptInviteMutation,
} = invitesApi;
