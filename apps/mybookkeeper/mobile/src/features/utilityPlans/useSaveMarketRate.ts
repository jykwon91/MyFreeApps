import { useDeleteMarketRateBenchmarkMutation, useUpsertMarketRateBenchmarkMutation } from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import type { MarketRateFormValues } from "@mybookkeeper/api-client/types/utility/market-rate-form-values";
import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { toMarketRateUpsert } from "@mybookkeeper/api-client/utils/marketRateForm";
import { useLeaveWhenSaved, useToast } from "@platform/mobile";
import { useState } from "react";
import { MARKET_RATE_MESSAGES as MESSAGES } from "../../constants/marketRates";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy, saveFailureCopy } from "../../lib/writeFailureCopy";

const REMOVE_COPY = deleteFailureCopy("market rate");

/** Records or removes one service's market rate, then leaves the screen once it landed. */
export function useSaveMarketRate(serviceType: UtilityServiceType, isNew: boolean) {
  const { showToast } = useToast();
  const [upsert] = useUpsertMarketRateBenchmarkMutation();
  const [deleteRate] = useDeleteMarketRateBenchmarkMutation();
  // One write for both actions, so the failure shown is always the latest one, never a stale save error.
  const write = useWrite();
  const [action, setAction] = useState<"save" | "remove">("save");
  const { isLeaving, leave } = useLeaveWhenSaved("/utility-plans/market-rates");
  const saveCopy = saveFailureCopy("market rate", "market rates", isNew);

  async function save(values: MarketRateFormValues): Promise<void> {
    setAction("save");
    const result = await write.run(() => upsert({ serviceType, data: toMarketRateUpsert(serviceType, values) }).unwrap(), { staysLocked: true });
    if (result !== "done") return;
    showToast(MESSAGES.saved);
    leave();
  }

  async function remove(): Promise<void> {
    setAction("remove");
    const result = await write.run(() => deleteRate(serviceType).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    showToast(result === "done" ? MESSAGES.removed : MESSAGES.alreadyRemoved);
    leave();
  }

  const failure = !write.failure ? null : action === "save" ? saveCopy[write.failure] : write.failure === "gone" ? null : REMOVE_COPY[write.failure];
  return { save, remove, isSaving: write.isBusy && action === "save", isRemoving: write.isBusy && action === "remove", isLeaving, failure };
}
