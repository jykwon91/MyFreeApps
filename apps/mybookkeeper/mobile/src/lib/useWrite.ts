import type { WriteFailure } from "@mybookkeeper/api-client/types/write/write-failure";
import { writeFailure } from "@mybookkeeper/api-client/utils/writeFailure";
import { useRef, useState } from "react";

type WriteResult = WriteFailure | "done" | "busy";

interface RunOptions {
  /** For a write after which the screen goes away: it can still be tapped while it slides off. */
  staysLocked?: boolean;
}

/** Runs one write at a time, tracking whether it's in flight and why it failed. */
export function useWrite() {
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<WriteFailure | null>(null);
  const [error, setError] = useState<unknown>(null);
  const isSending = useRef(false);

  /** "done" when the write went through, "busy" when one was already in flight (and nothing was sent), or why it failed. */
  async function run(action: () => Promise<unknown>, { staysLocked = false }: RunOptions = {}): Promise<WriteResult> {
    if (isSending.current) return "busy";
    isSending.current = true;
    setIsBusy(true);
    setFailure(null);
    setError(null);
    try {
      await action();
      if (!staysLocked) isSending.current = false;
      return "done";
    } catch (caught) {
      isSending.current = false;
      const reason = writeFailure(caught);
      setFailure(reason);
      setError(caught);
      return reason;
    } finally {
      setIsBusy(false);
    }
  }

  /** `error` is what the failed request threw, for the screens that show the server's own reason. */
  return {
    isBusy,
    failure,
    error,
    run,
    clearFailure: () => {
      setFailure(null);
      setError(null);
    },
  };
}
