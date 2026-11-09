import { useDeleteMarketRateBenchmarkMutation, useUpsertMarketRateBenchmarkMutation } from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import type { MarketRateFormValues } from "@mybookkeeper/api-client/types/utility/market-rate-form-values";
import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { toMarketRateUpsert } from "@mybookkeeper/api-client/utils/marketRateForm";
import { useToast } from "@platform/mobile";
import { MARKET_RATE_MESSAGES as MESSAGES } from "../../constants/marketRates";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy, saveFailureCopy } from "../../lib/writeFailureCopy";

const REMOVE_COPY = deleteFailureCopy("market rate");

/** Records or removes one service's market rate, then leaves the screen once it landed. */
export function useSaveMarketRate(serviceType: UtilityServiceType, isNew: boolean) {
  const { showToast } = useToast();
  const [upsert] = useUpsertMarketRateBenchmarkMutation();
  const [deleteRate] = useDeleteMarketRateBenchmarkMutation();
  const saving = useWrite();
  const removing = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved("/utility-plans/market-rates");
  const saveCopy = saveFailureCopy("market rate", "market rates", isNew);

  async function save(values: MarketRateFormValues): Promise<void> {
    const result = await saving.run(() => upsert({ serviceType, data: toMarketRateUpsert(serviceType, values) }).unwrap(), { staysLocked: true });
    if (result !== "done") return;
    showToast(MESSAGES.saved);
    leave();
  }

  async function remove(): Promise<void> {
    const result = await removing.run(() => deleteRate(serviceType).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    showToast(result === "done" ? MESSAGES.removed : MESSAGES.alreadyRemoved);
    leave();
  }

  const failure = saving.failure ? saveCopy[saving.failure] : removing.failure && removing.failure !== "gone" ? REMOVE_COPY[removing.failure] : null;
  return { save, remove, isSaving: saving.isBusy, isRemoving: removing.isBusy, isLeaving, failure };
}
