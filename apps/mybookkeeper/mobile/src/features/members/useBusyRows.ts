import { useCallback, useRef, useState } from "react";

/** One thing at a time per row, whatever else is happening on the screen. */
export function useBusyRows() {
  const [busy, setBusy] = useState<Readonly<Record<string, string>>>({});
  const inFlight = useRef(new Set<string>());

  const runOnce = useCallback(async (id: string, label: string, work: () => Promise<void>): Promise<void> => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setBusy((current) => ({ ...current, [id]: label }));
    try {
      await work();
    } finally {
      inFlight.current.delete(id);
      setBusy(({ [id]: _finished, ...rest }) => rest);
    }
  }, []);

  return { busy, runOnce };
}
