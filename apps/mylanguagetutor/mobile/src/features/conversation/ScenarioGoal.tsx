import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { GOAL_MARKS } from "../../constants/conversation";
import type { ScenarioGoalProps } from "../../types/ScenarioGoalProps";

/** One goal, marked done once the conversation has covered it. */
export default function ScenarioGoal({ goal, isMet }: ScenarioGoalProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View
      accessibilityLabel={`${goal} ${isMet ? PRACTICE_COPY.goalDone : PRACTICE_COPY.goalNotYet}`}
      accessible
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
    >
      <Text style={{ color: isMet ? colors.positiveText : colors.mutedForeground, fontSize: fontSize.sm }}>
        {isMet ? GOAL_MARKS.met : GOAL_MARKS.notYet}
      </Text>
      <Text style={{ color: isMet ? colors.foreground : colors.mutedForeground, fontSize: fontSize.xs }}>{goal}</Text>
    </View>
  );
}
