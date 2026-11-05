import { useRef, useState } from "react";
import type { ReplyTemplateWriteOutcome } from "../types/inquiry/reply-template-write-outcome";
import type { ReplyTemplateWriteSteps } from "../types/inquiry/reply-template-write-steps";
import { settleReplyTemplateWrite } from "../utils/settleReplyTemplateWrite";

/** Runs an archive or restore, ignoring repeat presses while one is in flight. */
export function useSettledReplyTemplateWrite(onDone: (outcome: ReplyTemplateWriteOutcome, id: string) => void) {
  const [isBusy, setIsBusy] = useState(false);
  const busy = useRef(false);

  async function run(id: string, steps: ReplyTemplateWriteSteps): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setIsBusy(true);
    try {
      onDone(await settleReplyTemplateWrite(id, steps), id);
    } finally {
      busy.current = false;
      setIsBusy(false);
    }
  }

  return { run, isBusy };
}
