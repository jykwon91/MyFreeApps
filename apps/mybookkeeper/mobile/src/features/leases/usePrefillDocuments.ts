import { usePrefillAddendumPlaceholdersMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useEffect, useState } from "react";
import type { PrefillState } from "../../types/PrefillState";

/** Asks what the chosen templates need, and what can already be filled in. `retry` asks again from scratch. */
export function usePrefillDocuments(leaseId: string, templateIds: readonly string[]): { state: PrefillState; retry: () => void; refresh: () => void } {
  const [prefill] = usePrefillAddendumPlaceholdersMutation();
  const [state, setState] = useState<PrefillState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const idsKey = templateIds.join(",");

  useEffect(() => {
    let isCurrent = true;
    prefill({ leaseId, templateIds: idsKey.split(",").filter(Boolean) })
      .unwrap()
      .then((response) => {
        if (isCurrent) setState({ status: "ready", items: response.items });
      })
      .catch((error: unknown) => {
        if (isCurrent) setState({ status: "failed", isGone: httpStatus(error) === 404 });
      });
    return () => {
      isCurrent = false;
    };
  }, [attempt, idsKey, leaseId, prefill]);

  function retry(): void {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  }

  /** Asks again without clearing the form, so what was typed stays while saved values turn read-only. */
  function refresh(): void {
    setAttempt((count) => count + 1);
  }

  return { state, retry, refresh };
}
