import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { useState } from "react";
import { Alert } from "react-native";
import { REMOVAL_UNSURE_MESSAGE } from "../constants/removal";
import type { RemovalMessages } from "../types/RemovalMessages";
import type { RemovalOptions } from "../types/RemovalOptions";
import { useToast } from "./useToast";

/**
 * Asks first, then removes, says how it went, and reports the removal in flight. A 404 means it's
 * already gone (removed elsewhere, or a double tap), which is what was asked for. Once it's gone it
 * stays "removing" until it leaves the screen; any other failure lets it be tried again. A lost answer or a
 * proxy error can come after the removal (see writeOutcome), so it says it isn't sure rather than that it
 * failed; trying again is safe, since one that already went answers 404. A removal a cache reset called off
 * (sign-out, account change) says nothing: whoever asked has been moved on from.
 */
export function useConfirmedRemoval(remove: () => Promise<unknown>, messages: RemovalMessages, options: RemovalOptions = {}) {
  const { showToast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);

  async function run(): Promise<void> {
    setIsRemoving(true);
    try {
      await remove();
      showToast(messages.removed);
      options.onRemoved?.();
    } catch (error) {
      if (isCancelledRequest(error)) {
        setIsRemoving(false);
        return;
      }
      if (isNotFound(error)) {
        showToast(messages.gone ?? messages.removed);
        options.onRemoved?.();
        return;
      }
      setIsRemoving(false);
      const refusal = options.refusalMessage?.(error) ?? null;
      if (refusal !== null) {
        showToast(refusal, "error");
        options.onRefused?.();
        return;
      }
      showToast(writeOutcome(error) === "unknown" ? REMOVAL_UNSURE_MESSAGE : messages.couldntRemove, "error");
    }
  }

  function confirmRemove(): void {
    Alert.alert(messages.removeTitle, messages.removeBody, [
      { text: messages.keep, style: "cancel" },
      { text: messages.remove, style: "destructive", onPress: () => void run() },
    ]);
  }

  return { isRemoving, confirmRemove };
}
