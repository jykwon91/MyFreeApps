import { baseApi } from "@platform/core/store/baseApi";
import type { RentReminderOverview } from "../types/rent/rent-reminder-overview";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";
import type { RentReminderPlanArgs } from "../types/rent/rent-reminder-plan-args";
import type { RentReminderPreview } from "../types/rent/rent-reminder-preview";
import type { RentReminderSend } from "../types/rent/rent-reminder-send";
import type { RentReminderSendNowArgs } from "../types/rent/rent-reminder-send-now-args";

const reminderTag = (applicantId: string) => ({
  type: "RentReminder" as const,
  id: applicantId,
});

/**
 * RTK Query slice for tenant rent reminders.
 *
 * Every mutation invalidates the tenant's whole reminder state: a plan change
 * moves the next due date and amount, and a send changes both the preview's
 * "already sent" channels and the history. The preview also listens to the
 * tenant's `RentLedger` tag, because the amount it quotes comes from the rent
 * schedule — editing the schedule must refresh it.
 */
const rentRemindersApi = baseApi.enhanceEndpoints({
  addTagTypes: ["RentReminder", "RentLedger"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getRentReminderOverview: builder.query<RentReminderOverview, string>({
      query: (applicantId) => ({ url: `/rent-reminders/tenants/${applicantId}` }),
      providesTags: (_r, _e, applicantId) => [reminderTag(applicantId)],
    }),

    getRentReminderPreview: builder.query<RentReminderPreview | null, string>({
      query: (applicantId) => ({
        url: `/rent-reminders/tenants/${applicantId}/preview`,
      }),
      providesTags: (_r, _e, applicantId) => [
        reminderTag(applicantId),
        { type: "RentLedger" as const, id: applicantId },
      ],
    }),

    getRentReminderSends: builder.query<RentReminderSend[], string>({
      query: (applicantId) => ({
        url: `/rent-reminders/tenants/${applicantId}/sends`,
      }),
      providesTags: (_r, _e, applicantId) => [reminderTag(applicantId)],
    }),

    createRentReminderPlan: builder.mutation<RentReminderPlan, RentReminderPlanArgs>({
      query: ({ applicantId, ...data }) => ({
        url: `/rent-reminders/tenants/${applicantId}/plan`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [reminderTag(applicantId)],
    }),

    updateRentReminderPlan: builder.mutation<RentReminderPlan, RentReminderPlanArgs>({
      query: ({ applicantId, ...data }) => ({
        url: `/rent-reminders/tenants/${applicantId}/plan`,
        method: "PUT",
        data,
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [reminderTag(applicantId)],
    }),

    deleteRentReminderPlan: builder.mutation<void, string>({
      query: (applicantId) => ({
        url: `/rent-reminders/tenants/${applicantId}/plan`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, applicantId) => [reminderTag(applicantId)],
    }),

    /** Sends every enabled channel together — email and text never go out
     *  at different times. */
    sendRentReminderNow: builder.mutation<RentReminderSend[], RentReminderSendNowArgs>({
      query: ({ applicantId, ...data }) => ({
        url: `/rent-reminders/tenants/${applicantId}/send-now`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [reminderTag(applicantId)],
    }),
  }),
});

export const {
  useGetRentReminderOverviewQuery,
  useGetRentReminderPreviewQuery,
  useGetRentReminderSendsQuery,
  useCreateRentReminderPlanMutation,
  useUpdateRentReminderPlanMutation,
  useDeleteRentReminderPlanMutation,
  useSendRentReminderNowMutation,
} = rentRemindersApi;

export default rentRemindersApi;
