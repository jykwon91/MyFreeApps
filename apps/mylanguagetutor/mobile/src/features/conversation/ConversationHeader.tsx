import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { ConversationHeaderProps } from "../../types/ConversationHeaderProps";
import ScenarioGoals from "./ScenarioGoals";

/** The scenario, what it's for, and its goals ticked off as the conversation covers them. */
export default function ConversationHeader({ scenario, goalsMet }: ConversationHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
        {scenario.title}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{scenario.goal}</Text>
      <ScenarioGoals goals={scenario.goals} met={goalsMet} />
    </View>
  );
}
