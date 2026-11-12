import { useNavigateRefinementMutation } from "@myjobhunter/api-client/store/resumeRefinementApi";
import { NavDirection } from "@myjobhunter/api-client/types/resume-refinement/nav-direction";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { refinementFailure } from "../../lib/refinementFailure";
import type { ResumeNavButtonsProps } from "../../types/ResumeNavButtonsProps";

/** Moves between suggestions without accepting, skipping or rewriting this one. */
export default function ResumeNavButtons({ sessionId, targetIndex, totalTargets, isPending }: ResumeNavButtonsProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [navigate, { isLoading }] = useNavigateRefinementMutation();
  const isBusy = isPending || isLoading;

  async function move(direction: NavDirection): Promise<void> {
    try {
      await navigate({ id: sessionId, direction }).unwrap();
    } catch (error) {
      showToast(refinementFailure(error), "error");
    }
  }

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <LoadingButton accessibilityHint={MESSAGES.previousHint} disabled={isBusy || targetIndex <= 0} onPress={() => move(NavDirection.PREV)} style={{ flex: 1 }} variant="ghost">
        {MESSAGES.previous}
      </LoadingButton>
      <LoadingButton
        accessibilityHint={MESSAGES.nextHint}
        disabled={isBusy || targetIndex >= totalTargets - 1}
        onPress={() => move(NavDirection.NEXT)}
        style={{ flex: 1 }}
        variant="ghost"
      >
        {MESSAGES.next}
      </LoadingButton>
    </View>
  );
}
