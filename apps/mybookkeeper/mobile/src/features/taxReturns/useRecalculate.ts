import { useRecomputeMutation } from "@mybookkeeper/api-client/store/taxReturnsApi";
import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { Alert } from "react-native";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";

export function useRecalculate(taxReturn: TaxReturn | undefined): { recalculate: () => Promise<void> | void; isRecalculating: boolean } {
  const { showToast } = useToast();
  const [recompute, { isLoading }] = useRecomputeMutation();
  // The button only blocks a second press while a promise runs, and the question isn't one.
  const isAsking = useRef(false);

  async function run(id: string): Promise<void> {
    try {
      await recompute(id).unwrap();
      showToast(MESSAGES.recalculated, "success");
    } catch {
      showToast(MESSAGES.couldntRecalculate, "error");
    }
  }

  function recalculate(): Promise<void> | void {
    if (!taxReturn) return;
    const { id, status } = taxReturn;
    // Handing the promise back is what lets the button block a second press straight away.
    if (status !== "filed") return run(id);
    if (isAsking.current) return;
    isAsking.current = true;
    const stopAsking = () => {
      isAsking.current = false;
    };
    Alert.alert(
      MESSAGES.filedTitle,
      MESSAGES.filedBody,
      [
        { text: MESSAGES.cancel, style: "cancel", onPress: stopAsking },
        {
          text: MESSAGES.recalculateAnyway,
          style: "destructive",
          onPress: () => {
            stopAsking();
            void run(id);
          },
        },
      ],
      { onDismiss: stopAsking },
    );
  }

  return { recalculate, isRecalculating: isLoading };
}
