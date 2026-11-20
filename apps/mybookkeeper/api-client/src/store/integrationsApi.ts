import { baseApi } from "@platform/core/store/baseApi";
import { GMAIL_SYNC_TIMEOUT_MS } from "../constants/gmailSync";
import { SYNC_INVALIDATED_TAGS } from "../constants/emailDerivedTags";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { GmailConnectClient } from "../types/integration/gmail-connect-client";
import type { GmailConnectCompletion } from "../types/integration/gmail-connect-completion";
import type { Integration } from "../types/integration/integration";
import type { SyncLog } from "../types/integration/sync-log";

export const integrationsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Integration", "Document", "Summary", "Transaction", "Reconciliation", "TaxReturn", "RentLedger", "SignedLease"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getIntegrations: builder.query<Integration[], void>({
      query: () => ({ url: "/integrations" }),
      providesTags: ["Integration"],
    }),
    // The website leaves `client` off; the phone says so, and Google's answer comes back to the app.
    connectGmail: builder.mutation<{ auth_url: string }, GmailConnectClient | void>({
      query: (client) => ({ url: "/integrations/gmail/connect", params: client ? { client } : undefined }),
    }),
    // Google's answer comes back to the app that started it, which finishes it here, signed in,
    // so it only ever connects the Gmail of the person who started it.
    completeGmailConnect: builder.mutation<void, GmailConnectCompletion>({
      query: (data) => ({ url: "/integrations/gmail/complete", method: "POST", data }),
    }),
    disconnectGmail: builder.mutation<void, void>({
      query: () => ({ url: "/integrations/gmail", method: "DELETE" }),
      invalidatesTags: ["Integration"],
    }),
    syncGmail: builder.mutation<{ status: string; count?: number }, void>({
      query: () => ({ url: "/integrations/gmail/sync", method: "POST", timeout: GMAIL_SYNC_TIMEOUT_MS }),
      invalidatesTags: SYNC_INVALIDATED_TAGS,
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
      invalidatesTags: SYNC_INVALIDATED_TAGS,
    }),
    dismissQueueItem: builder.mutation<void, string>({
      query: (id) => ({ url: `/integrations/gmail/queue/${id}`, method: "DELETE" }),
      invalidatesTags: ["Integration"],
    }),
    retryQueueItem: builder.mutation<{ id: string; status: string }, string>({
      query: (id) => ({ url: `/integrations/gmail/queue/${id}/retry`, method: "POST" }),
      invalidatesTags: SYNC_INVALIDATED_TAGS,
    }),
    retryAllFailed: builder.mutation<{ status: string }, void>({
      query: () => ({ url: "/integrations/gmail/queue/retry-all", method: "POST" }),
      invalidatesTags: SYNC_INVALIDATED_TAGS,
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
  useCompleteGmailConnectMutation,
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
