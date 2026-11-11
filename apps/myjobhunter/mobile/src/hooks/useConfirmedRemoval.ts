import { isNotFound } from "@platform/core/utils/isNotFound";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert } from "react-native";
import type { RemovalMessages } from "../types/RemovalMessages";
import type { RemovalOptions } from "../types/RemovalOptions";

/**
 * Asks first, then removes, says how it went, and reports the removal in flight. A 404 means it's
 * already gone (removed elsewhere, or a double tap), which is what was asked for. Once it's gone it
 * stays "removing" until it leaves the screen; any other failure lets it be tried again.
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
      if (isNotFound(error)) {
        showToast(messages.gone ?? messages.removed);
        options.onRemoved?.();
        return;
      }
      setIsRemoving(false);
      const refusal = options.refusalMessage?.(error) ?? null;
      showToast(refusal ?? messages.couldntRemove, "error");
      if (refusal !== null) options.onRefused?.();
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
