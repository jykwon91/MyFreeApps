import { baseApi } from "./baseApi";
import type { RentChargeCreateRequest } from "@/shared/types/rent/rent-charge-create-request";
import type { RentLedgerResponse } from "@/shared/types/rent/rent-ledger-response";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";
import type { RentScheduleCreateRequest } from "@/shared/types/rent/rent-schedule-create-request";
import type { RentScheduleUpdateRequest } from "@/shared/types/rent/rent-schedule-update-request";

export interface RentLedgerArgs {
  applicantId: string;
  /** Evaluate the ledger as of this date instead of today. */
  asOf?: string;
}

export interface RentScheduleUpdateArgs extends RentScheduleUpdateRequest {
  scheduleId: string;
}

/**
 * RTK Query slice for the tenant rent ledger.
 *
 * Every mutation invalidates the whole ledger for the tenant rather than
 * patching a row: a charge waiver or a shortened tenancy re-runs FIFO
 * allocation across every period, so any single row's derived `allocated`,
 * `remaining` and `status` can change without that row itself being touched.
 * The tag is keyed on the applicant because that is the only id the caller
 * always has — a schedule mutation carries `applicantId` alongside the
 * schedule id purely so the right ledger gets invalidated.
 */
const rentLedgerApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRentLedger: builder.query<RentLedgerResponse, RentLedgerArgs>({
      query: ({ applicantId, asOf }) => ({
        url: `/rent-ledger/tenants/${applicantId}`,
        params: asOf ? { as_of: asOf } : undefined,
      }),
      providesTags: (_r, _e, { applicantId }) => [
        { type: "RentLedger" as const, id: applicantId },
      ],
    }),

    createRentSchedule: builder.mutation<RentSchedule, RentScheduleCreateRequest>({
      query: (data) => ({ url: "/rent-ledger/schedules", method: "POST", data }),
      invalidatesTags: (_r, _e, { applicant_id }) => [
        { type: "RentLedger" as const, id: applicant_id },
      ],
    }),

    updateRentSchedule: builder.mutation<
      RentSchedule,
      RentScheduleUpdateArgs & { applicantId: string }
    >({
      query: ({ scheduleId, applicantId: _applicantId, ...data }) => ({
        url: `/rent-ledger/schedules/${scheduleId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [
        { type: "RentLedger" as const, id: applicantId },
      ],
    }),

    deleteRentSchedule: builder.mutation<
      void,
      { scheduleId: string; applicantId: string }
    >({
      query: ({ scheduleId }) => ({
        url: `/rent-ledger/schedules/${scheduleId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [
        { type: "RentLedger" as const, id: applicantId },
      ],
    }),

    createRentCharge: builder.mutation<{ id: string }, RentChargeCreateRequest>({
      query: (data) => ({ url: "/rent-ledger/charges", method: "POST", data }),
      invalidatesTags: (_r, _e, { applicant_id }) => [
        { type: "RentLedger" as const, id: applicant_id },
      ],
    }),

    waiveRentCharge: builder.mutation<
      void,
      { chargeId: string; applicantId: string; reason: string }
    >({
      query: ({ chargeId, reason }) => ({
        url: `/rent-ledger/charges/${chargeId}/waive`,
        method: "POST",
        data: { reason },
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [
        { type: "RentLedger" as const, id: applicantId },
      ],
    }),

    unwaiveRentCharge: builder.mutation<
      void,
      { chargeId: string; applicantId: string }
    >({
      query: ({ chargeId }) => ({
        url: `/rent-ledger/charges/${chargeId}/waive`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [
        { type: "RentLedger" as const, id: applicantId },
      ],
    }),

    deleteRentCharge: builder.mutation<
      void,
      { chargeId: string; applicantId: string }
    >({
      query: ({ chargeId }) => ({
        url: `/rent-ledger/charges/${chargeId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { applicantId }) => [
        { type: "RentLedger" as const, id: applicantId },
      ],
    }),
  }),
});

export const {
  useGetRentLedgerQuery,
  useCreateRentScheduleMutation,
  useUpdateRentScheduleMutation,
  useDeleteRentScheduleMutation,
  useCreateRentChargeMutation,
  useWaiveRentChargeMutation,
  useUnwaiveRentChargeMutation,
  useDeleteRentChargeMutation,
} = rentLedgerApi;

export default rentLedgerApi;
