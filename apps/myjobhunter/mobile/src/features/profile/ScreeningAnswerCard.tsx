import { useDeleteScreeningAnswerMutation } from "@myjobhunter/api-client/store/screeningAnswersApi";
import { screeningQuestionLabel } from "@myjobhunter/api-client/utils/screeningQuestionLabel";
import { useConfirmedRemoval, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { SCREENING_MESSAGES as MESSAGES } from "../../constants/profileScreening";
import type { ScreeningAnswerCardProps } from "../../types/ScreeningAnswerCardProps";
import CardActions from "./CardActions";

/** A question and its saved answer, then Edit and Remove. */
export default function ScreeningAnswerCard({ answer, onEdit }: ScreeningAnswerCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [deleteAnswer] = useDeleteScreeningAnswerMutation();
  const question = screeningQuestionLabel(answer.question_key);
  const { isRemoving, confirmRemove } = useConfirmedRemoval(() => deleteAnswer(answer.id).unwrap(), {
    ...MESSAGES,
    remove: PROFILE_MESSAGES.remove,
    keep: PROFILE_MESSAGES.keep,
  });
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`screening-${answer.id}`}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{question}</Text>
      {answer.answer ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {answer.answer}
        </Text>
      ) : (
        <Text style={{ fontSize: fontSize.md, fontStyle: "italic", color: colors.mutedForeground }}>{MESSAGES.noAnswer}</Text>
      )}
      <CardActions isRemoving={isRemoving} onEdit={onEdit} onRemove={confirmRemove} subject={question} />
    </View>
  );
}
