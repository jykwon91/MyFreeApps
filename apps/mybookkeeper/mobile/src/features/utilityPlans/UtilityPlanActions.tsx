import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useRef } from "react";
import { View } from "react-native";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import { askOnce } from "../../lib/askOnce";
import { useRemoveUtilityPlan } from "./useRemoveUtilityPlan";

interface UtilityPlanActionsProps {
  planId: string;
  title: string;
  onRemoved: () => void;
}

/** What a writer can do with a plan: change it, or remove it after being asked. */
export default function UtilityPlanActions({ planId, title, onRemoved }: UtilityPlanActionsProps) {
  const { spacing } = useTheme();
  const asking = useRef(false);
  const { remove, isRemoving, failure } = useRemoveUtilityPlan(planId, onRemoved);

  return (
    <View style={{ gap: spacing.sm }}>
      {failure ? <Banner message={failure} /> : null}
      <LoadingButton disabled={isRemoving} onPress={() => router.push(`/utility-plans/${planId}/edit`)}>
        {MESSAGES.edit}
      </LoadingButton>
      <LoadingButton
        disabled={isRemoving}
        isLoading={isRemoving}
        loadingText={MESSAGES.removing}
        onPress={() => askOnce(asking, `${MESSAGES.remove}: ${title}?`, MESSAGES.removeBody, { text: MESSAGES.confirmRemove, style: "destructive", onPress: () => void remove() })}
        variant="destructive"
      >
        {MESSAGES.remove}
      </LoadingButton>
    </View>
  );
}
