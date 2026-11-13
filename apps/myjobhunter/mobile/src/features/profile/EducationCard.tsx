import { useDeleteEducationMutation } from "@myjobhunter/api-client/store/educationApi";
import { educationDegreeLine } from "@myjobhunter/api-client/utils/educationDegreeLine";
import { educationYearsLine } from "@myjobhunter/api-client/utils/educationYearsLine";
import { useConfirmedRemoval, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { EDUCATION_MESSAGES as MESSAGES } from "../../constants/profileEducation";
import type { EducationCardProps } from "../../types/EducationCardProps";
import CardActions from "./CardActions";

/** A school: its degree and field, years and GPA when set, then Edit and Remove. */
export default function EducationCard({ entry, onEdit }: EducationCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [deleteEducation] = useDeleteEducationMutation();
  const { isRemoving, confirmRemove } = useConfirmedRemoval(() => deleteEducation(entry.id).unwrap(), {
    ...MESSAGES,
    remove: PROFILE_MESSAGES.remove,
    keep: PROFILE_MESSAGES.keep,
  });
  const degree = educationDegreeLine(entry);
  const years = educationYearsLine(entry);
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`education-${entry.id}`}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{entry.school}</Text>
      {degree ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{degree}</Text> : null}
      {years ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{years}</Text> : null}
      {entry.gpa ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${MESSAGES.gpaPrefix}: ${entry.gpa}`}</Text> : null}
      <CardActions isRemoving={isRemoving} onEdit={onEdit} onRemove={confirmRemove} subject={entry.school} />
    </View>
  );
}
