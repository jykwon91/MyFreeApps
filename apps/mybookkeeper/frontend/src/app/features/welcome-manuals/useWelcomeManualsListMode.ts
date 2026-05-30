import type { WelcomeManualsListMode } from "@/shared/types/welcome-manual/welcome-manuals-list-mode";

interface UseWelcomeManualsListModeArgs {
  isLoading: boolean;
  isError: boolean;
  manualCount: number;
}

/**
 * Resolves the welcome-manuals list render mode from loaded state. Single
 * source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useWelcomeManualsListMode({
  isLoading,
  isError,
  manualCount,
}: UseWelcomeManualsListModeArgs): WelcomeManualsListMode {
  if (isLoading) return "loading";
  if (manualCount === 0 && !isError) return "empty";
  return "list";
}
