import { useGetRentReminderSendsQuery, useSendRentReminderNowMutation } from "@mybookkeeper/api-client/store/rentRemindersApi";
import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { useToast } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { LOST_SEND_HOLD_MS, REMINDER_MESSAGES } from "../../constants/rentReminders";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "../transactions/transactionMessages";
import { sendOutcome } from "./rentReminderDisplay";

function refusal(error: unknown): string | null {
  switch (httpStatus(error)) {
    case 403:
      return isDemoRefusal(error) ? REMINDER_MESSAGES.demo : UPLOAD_MESSAGES.notAllowed;
    case 404:
      return REMINDER_MESSAGES.gone;
    case 409:
      return REMINDER_MESSAGES.alreadyWent;
    case 412:
      return REMINDER_MESSAGES.changed;
    case 422:
      return REMINDER_MESSAGES.cantGoOut;
    case 429:
      return REMINDER_MESSAGES.tooMany;
    default:
      return null;
  }
}

export function useSendRentReminder(applicantId: string, name: string | null) {
  const { showToast } = useToast();
  const [sendNow] = useSendRentReminderNowMutation();
  const { refetch: refetchHistory } = useGetRentReminderSendsQuery(applicantId);
  const [isSending, setIsSending] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The next load can fail or come late, and this mustn't look sendable meanwhile.
  const [sentDueDate, setSentDueDate] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  function hold(): void {
    setIsHeld(true);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setIsHeld(false), LOST_SEND_HOLD_MS);
  }

  /** A message can't be recalled, and the server may have sent it before the answer was lost. */
  async function checkWhatHappened(dueDate: string): Promise<void> {
    const latest = await refetchHistory();
    if (!latest.isSuccess) {
      setProblem(REMINDER_MESSAGES.unreachable);
      hold();
    } else if (latest.data.some((row) => row.due_date === dueDate && row.status !== "failed")) {
      setProblem(REMINDER_MESSAGES.lostButSent);
      setSentDueDate(dueDate);
    } else {
      setProblem(REMINDER_MESSAGES.lostUnknown);
      hold();
    }
  }

  async function send(preview: RentReminderPreview, channels: RentReminderChannel[]): Promise<void> {
    setIsSending(true);
    setProblem(null);
    try {
      const rows = await sendNow({
        applicantId,
        due_date: preview.due_date,
        amount: preview.amount,
        message: preview.send_now_message,
        channels,
      }).unwrap();
      const outcome = sendOutcome(rows, name);
      if (rows.some((row) => row.status !== "failed")) setSentDueDate(preview.due_date);
      if (outcome.isProblem) setProblem(outcome.message);
      showToast(outcome.message, outcome.isProblem ? "error" : "success");
    } catch (error) {
      const refused = refusal(error);
      if (httpStatus(error) === 409) setSentDueDate(preview.due_date);
      if (refused) showToast(refused, "error");
      else await checkWhatHappened(preview.due_date);
    } finally {
      setIsSending(false);
    }
  }

  return { send, isSending, isHeld, problem, sentDueDate };
}
