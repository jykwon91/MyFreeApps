import { NavDirection } from "@myjobhunter/api-client/types/resume-refinement/nav-direction";
import { LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeNavButtonsProps } from "../../types/ResumeNavButtonsProps";

/**
 * Moves between suggestions without accepting, skipping or rewriting this one. The move shares the card's busy
 * state, so the answer buttons wait for it and it waits for them.
 */
export default function ResumeNavButtons({ targetIndex, totalTargets, isPending, onMove }: ResumeNavButtonsProps) {
  const { spacing } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <LoadingButton accessibilityHint={MESSAGES.previousHint} disabled={isPending || targetIndex <= 0} onPress={() => onMove(NavDirection.PREV)} style={{ flex: 1 }} variant="ghost">
        {MESSAGES.previous}
      </LoadingButton>
      <LoadingButton
        accessibilityHint={MESSAGES.nextHint}
        disabled={isPending || targetIndex >= totalTargets - 1}
        onPress={() => onMove(NavDirection.NEXT)}
        style={{ flex: 1 }}
        variant="ghost"
      >
        {MESSAGES.next}
      </LoadingButton>
    </View>
  );
}
