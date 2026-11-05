import { useEffect } from "react";

/**
 * An RTK Query mutation hook keeps the arguments it was called with until reset.
 * Use this when those include something secret, like a password. It clears the hook's
 * whole state, so read the result from `.unwrap()`, not from `data` or `error`.
 *
 * In an effect because the `reset` from the render that fired the mutation does nothing.
 */
export function useForgetMutationArgs(originalArgs: unknown, isLoading: boolean, reset: () => void): void {
  useEffect(() => {
    if (originalArgs !== undefined && !isLoading) reset();
  }, [originalArgs, isLoading, reset]);
}
