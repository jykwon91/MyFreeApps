import { resumeJobFileName } from "@myjobhunter/api-client/utils/resumeJobFileName";
import { resumeJobSummary } from "@myjobhunter/api-client/utils/resumeJobSummary";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import type { ResumeJobRowProps } from "../../types/ResumeJobRowProps";
import ResumeUploadDetails from "./ResumeUploadDetails";

/** One uploaded resume to choose: its file name and what was read from it, with the upload's details. */
export default function ResumeJobRow({ job, isSelected, onSelect }: ResumeJobRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const name = resumeJobFileName(job);
  const summary = resumeJobSummary(job);
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? colors.primary : colors.border,
        backgroundColor: colors.card,
      }}
      testID={`resume-job-${job.id}`}
    >
      <Pressable
        accessibilityLabel={`${name}, ${summary}`}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
        onPress={onSelect}
        style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, justifyContent: "center", borderRadius: radius.md, backgroundColor: pressed ? colors.muted : "transparent" })}
      >
        <Text style={{ color: colors.foreground, fontSize: fontSize.sm, fontWeight: "600" }}>{name}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{summary}</Text>
      </Pressable>
      <ResumeUploadDetails job={job} />
    </View>
  );
}
