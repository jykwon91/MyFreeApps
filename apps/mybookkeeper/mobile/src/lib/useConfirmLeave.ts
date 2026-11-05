import { usePreventRemove } from "expo-router";
import { useState } from "react";

/**
 * Stops the screen going while `shouldGuard` is true and calls `ask`, which is given the way to
 * really leave. Re-sending the blocked action by hand doesn't work: the guard refuses it again.
 */
export function useConfirmLeave(shouldGuard: boolean, ask: (leave: () => void) => void): void {
  const [hasChosenToLeave, setHasChosenToLeave] = useState(false);

  usePreventRemove(shouldGuard && !hasChosenToLeave, ({ repeat }) => {
    ask(() => {
      setHasChosenToLeave(true);
      repeat();
    });
  });
}
