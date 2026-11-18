import type { SectionErrorProps } from "@platform/mobile";
import { PICKER_LOAD_MESSAGES } from "../constants/pickerLoad";
import type { PickerLoadState } from "../types/PickerLoadState";

/** The failure a picker shows in place of its choices, or undefined while they're loading or loaded. */
export function pickerLoadError({ hasLoaded, error, refetch }: PickerLoadState, message: string): SectionErrorProps | undefined {
  if (hasLoaded || !error) return undefined;
  return {
    message,
    retryLabel: PICKER_LOAD_MESSAGES.retry,
    onRetry: () => refetch(),
  };
}
