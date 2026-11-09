import { useUpdateSuggestionStatusMutation } from "@mybookkeeper/api-client/store/taxReturnsApi";
import type { SuggestionStatus } from "@mybookkeeper/api-client/types/tax/SuggestionStatus";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../constants/taxAdvisor";
import { useWrite } from "../../lib/useWrite";

/** Marks one suggestion resolved or dismissed. Remembers which of the two is in flight, so only that button shows busy. */
export function useSuggestionStatus(returnId: string, suggestionId: string) {
  const { showToast } = useToast();
  const [updateStatus] = useUpdateSuggestionStatusMutation();
  const write = useWrite();
  const [pending, setPending] = useState<SuggestionStatus | null>(null);

  async function update(status: SuggestionStatus): Promise<void> {
    setPending(status);
    const result = await write.run(() => updateStatus({ returnId, suggestionId, status }).unwrap());
    setPending(null);
    // The advisor reloads on success and the card moves with it, so only a failure needs saying.
    if (result !== "done" && result !== "busy") showToast(MESSAGES.couldntUpdate, "error");
  }

  return { update, pending, isBusy: write.isBusy };
}
