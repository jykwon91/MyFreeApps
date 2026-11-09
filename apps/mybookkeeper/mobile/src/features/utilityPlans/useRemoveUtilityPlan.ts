import { useDeleteUtilityPlanMutation } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { useToast } from "@platform/mobile";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy } from "../../lib/writeFailureCopy";

const COPY = deleteFailureCopy("utility plan");

/** Removes a plan. A plan that's already gone counts as removed, and `onRemoved` leaves the screen either way. */
export function useRemoveUtilityPlan(planId: string, onRemoved: () => void) {
  const { showToast } = useToast();
  const [deletePlan] = useDeleteUtilityPlanMutation();
  const write = useWrite();

  async function remove(): Promise<void> {
    const result = await write.run(() => deletePlan(planId).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onRemoved();
    showToast(result === "done" ? MESSAGES.removed : MESSAGES.alreadyRemoved);
  }

  return { remove, isRemoving: write.isBusy, failure: write.failure && write.failure !== "gone" ? COPY[write.failure] : null };
}
