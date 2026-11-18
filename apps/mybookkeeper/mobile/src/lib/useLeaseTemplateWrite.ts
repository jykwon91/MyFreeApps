import { useRef, useState } from "react";
import type { LeaseTemplateFailureCopy } from "@mybookkeeper/api-client/types/lease/lease-template-failure-copy";
import type { LeaseTemplateWriteResult } from "../types/LeaseTemplateWriteResult";
import { leaseTemplateFailureMessage } from "@mybookkeeper/api-client/utils/leaseTemplateFailureMessage";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import type { LeaseTemplateWriteOptions } from "../types/LeaseTemplateWriteOptions";

/** Runs one template write at a time, tracking whether it's in flight and what to tell the person if it failed. */
export function useLeaseTemplateWrite(copy: LeaseTemplateFailureCopy) {
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isSending = useRef(false);

  async function run(action: () => Promise<unknown>, { staysLocked = false }: LeaseTemplateWriteOptions = {}): Promise<LeaseTemplateWriteResult> {
    if (isSending.current) return "busy";
    isSending.current = true;
    setIsBusy(true);
    setMessage(null);
    try {
      await action();
      if (!staysLocked) isSending.current = false;
      return "done";
    } catch (error) {
      isSending.current = false;
      // A cache reset called it off: nobody is left to tell.
      if (isCancelledRequest(error)) return "cancelled";
      const failed = leaseTemplateFailureMessage(error, copy);
      setMessage(failed.message);
      return failed.failure;
    } finally {
      setIsBusy(false);
    }
  }

  return { isBusy, message, run, clearMessage: () => setMessage(null) };
}
