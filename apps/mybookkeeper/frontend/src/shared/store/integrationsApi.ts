import { baseApi } from "./baseApi";
import type { Integration } from "@/shared/types/integration/integration";
import type { SyncLog } from "@/shared/types/integration/sync-log";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";

const integrationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getIntegrations: builder.query<Integration[], void>({
      query: () => ({ url: "/integrations" }),
      providesTags: ["Integration"],
    }),
    connectGmail: builder.mutation<{ auth_url: string }, void>({
      query: () => ({ url: "/integrations/gmail/connect" }),
    }),
    disconnectGmail: builder.mutation<void, void>({
      query: () => ({ url: "/integrations/gmail", method: "DELETE" }),
      invalidatesTags: ["Integration"],
    }),
    syncGmail: builder.mutation<{ status: string; count?: number }, void>({
      query: () => ({ url: "/integrations/gmail/sync", method: "POST" }),
      invalidatesTags: ["Integration", "Document", "Summary", "Transaction"],
    }),
    getSyncLogs: builder.query<SyncLog[], void>({
      query: () => ({ url: "/integrations/gmail/logs" }),
      providesTags: ["Integration"],
    }),
    cancelGmailSync: builder.mutation<void, { sync_log_id: number } | void>({
      query: (data) => ({
        url: "/integrations/gmail/sync/cancel",
        method: "POST",
        data: data ?? {},
      }),
      invalidatesTags: ["Integration"],
    }),
    getEmailQueue: builder.query<EmailQueueItem[], void>({
      query: () => ({ url: "/integrations/gmail/queue" }),
      providesTags: ["Integration"],
    }),
    extractAll: builder.mutation<{ count: number }, void>({
      query: () => ({ url: "/integrations/gmail/extract", method: "POST" }),
      invalidatesTags: ["Integration", "Document", "Summary"],
    }),
    dismissQueueItem: builder.mutation<void, string>({
      query: (id) => ({ url: `/integrations/gmail/queue/${id}`, method: "DELETE" }),
      invalidatesTags: ["Integration"],
    }),
    retryQueueItem: builder.mutation<{ id: string; status: string }, string>({
      query: (id) => ({ url: `/integrations/gmail/queue/${id}/retry`, method: "POST" }),
      invalidatesTags: ["Integration", "Document", "Summary", "Transaction"],
    }),
    retryAllFailed: builder.mutation<{ status: string }, void>({
      query: () => ({ url: "/integrations/gmail/queue/retry-all", method: "POST" }),
      invalidatesTags: ["Integration", "Document", "Summary", "Transaction"],
    }),
    updateGmailLabel: builder.mutation<Integration, { label: string }>({
      query: (data) => ({ url: "/integrations/gmail/label", method: "PATCH", data }),
      invalidatesTags: ["Integration"],
    }),
  }),
});

export const {
  useGetIntegrationsQuery,
  useConnectGmailMutation,
  useDisconnectGmailMutation,
  useSyncGmailMutation,
  useGetSyncLogsQuery,
  useCancelGmailSyncMutation,
  useGetEmailQueueQuery,
  useExtractAllMutation,
  useDismissQueueItemMutation,
  useRetryQueueItemMutation,
  useRetryAllFailedMutation,
  useUpdateGmailLabelMutation,
} = integrationsApi;
