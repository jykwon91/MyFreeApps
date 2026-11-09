import { useDeleteMortgageMutation } from "@mybookkeeper/api-client/store/mortgagesApi";
import { LoadingButton, useToast } from "@platform/mobile";
import { useRef } from "react";
import { MORTGAGE_MESSAGES as MESSAGES } from "../../constants/mortgages";
import { askOnce } from "../../lib/askOnce";
import { leaveToMortgages } from "./mortgageNavigation";
import { mortgageRemoveFailure } from "./mortgageRemoveFailure";

interface RemoveMortgageButtonProps {
  mortgageId: string;
  title: string;
  /** Called before leaving, so the screen doesn't flash "can't find" as the loan drops out. */
  onRemoved: () => void;
}

export default function RemoveMortgageButton({ mortgageId, title, onRemoved }: RemoveMortgageButtonProps) {
  const { showToast } = useToast();
  const [deleteMortgage, { isLoading }] = useDeleteMortgageMutation();
  const asking = useRef(false);

  async function remove(): Promise<void> {
    try {
      await deleteMortgage(mortgageId).unwrap();
      onRemoved();
      showToast(MESSAGES.removed);
      leaveToMortgages();
    } catch (error) {
      const outcome = mortgageRemoveFailure(error);
      if (outcome === "gone") {
        onRemoved();
        showToast(MESSAGES.alreadyRemoved);
        leaveToMortgages();
        return;
      }
      showToast(outcome.message, "error");
    }
  }

  return (
    <LoadingButton
      isLoading={isLoading}
      loadingText={MESSAGES.removing}
      onPress={() => askOnce(asking, `${MESSAGES.remove}: ${title}?`, MESSAGES.removeBody, { text: "Remove", style: "destructive", onPress: () => void remove() })}
      variant="destructive"
    >
      {MESSAGES.remove}
    </LoadingButton>
  );
}
