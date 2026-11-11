import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { ScreeningAnswerGroupProps } from "../../types/ScreeningAnswerGroupProps";
import ScreeningAnswerCard from "./ScreeningAnswerCard";

/** One group of answers under its label; nothing when the group is empty. */
export default function ScreeningAnswerGroup({ title, answers, onEdit }: ScreeningAnswerGroupProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (answers.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xs, fontWeight: "500", textTransform: "uppercase", color: colors.mutedForeground }}>
        {title}
      </Text>
      {answers.map((answer) => (
        <ScreeningAnswerCard answer={answer} key={answer.id} onEdit={() => onEdit(answer)} />
      ))}
    </View>
  );
}
