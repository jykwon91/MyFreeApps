import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { ScenarioGoalsProps } from "../../types/ScenarioGoalsProps";
import ScenarioGoal from "./ScenarioGoal";

/** The scenario's goals, ticked off as the conversation covers them. */
export default function ScenarioGoals({ goals, met }: ScenarioGoalsProps) {
  const { spacing } = useTheme();
  if (goals.length === 0) return null;
  const done = new Set(met);
  return (
    <View accessibilityLabel={PRACTICE_COPY.goalsLabel} accessibilityRole="list" style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: spacing.xs }}>
      {goals.map((goal, index) => (
        <ScenarioGoal goal={goal} isMet={done.has(index)} key={goal} />
      ))}
    </View>
  );
}
