import { useState } from "react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useCreateRentScheduleMutation,
  useDeleteRentScheduleMutation,
  useUpdateRentScheduleMutation,
} from "@/shared/store/rentLedgerApi";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import type { RentCadence } from "@/shared/types/rent/rent-cadence";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

export interface UseRentScheduleFormArgs {
  applicantId: string;
  existing: RentSchedule | null;
  onSaved: () => void;
}

/**
 * Form state for creating or amending a rent schedule.
 *
 * On an existing schedule the amount and cadence are read-only: rewriting them
 * would restate what was owed for periods already settled. The dialog surfaces
 * that as fixed text and only sends the fields the backend accepts on a PATCH.
 */
export function useRentScheduleForm({
  applicantId,
  existing,
  onSaved,
}: UseRentScheduleFormArgs) {
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [cadence, setCadence] = useState<RentCadence>(existing?.cadence ?? "monthly");
  const [startDate, setStartDate] = useState(existing?.start_date ?? "");
  const [endDate, setEndDate] = useState(existing?.end_date ?? "");
  const [graceDays, setGraceDays] = useState(
    existing?.grace_days === null || existing?.grace_days === undefined
      ? ""
      : String(existing.grace_days),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [create, { isLoading: isCreating }] = useCreateRentScheduleMutation();
  const [update, { isLoading: isUpdating }] = useUpdateRentScheduleMutation();
  const [remove, { isLoading: isRemoving }] = useDeleteRentScheduleMutation();

  const parsedAmount = parseFloat(amount);
  const canSubmit = existing
    ? true
    : Boolean(startDate) && Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      if (existing) {
        await update({
          scheduleId: existing.id,
          applicantId,
          // Always sent, so clearing a value reaches the backend as an
          // explicit null rather than being read as "left alone".
          end_date: endDate || null,
          grace_days: graceDays === "" ? null : Number(graceDays),
          notes: notes.trim() || null,
        }).unwrap();
        showSuccess("Rent schedule updated.");
      } else {
        await create({
          applicant_id: applicantId,
          amount,
          cadence,
          start_date: startDate,
          end_date: endDate || null,
          grace_days: graceDays === "" ? null : Number(graceDays),
          notes: notes.trim() || null,
        }).unwrap();
        showSuccess("Rent schedule saved.");
      }
      onSaved();
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  async function handleRemove() {
    if (!existing) return;
    try {
      await remove({ scheduleId: existing.id, applicantId }).unwrap();
      showSuccess("Rent schedule removed.");
      onSaved();
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  return {
    amount,
    setAmount,
    cadence,
    setCadence,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    graceDays,
    setGraceDays,
    notes,
    setNotes,
    canSubmit,
    isSaving: isCreating || isUpdating,
    isRemoving,
    handleSubmit,
    handleRemove,
  };
}
