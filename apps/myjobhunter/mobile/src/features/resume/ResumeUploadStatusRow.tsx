import { RESUME_JOB_STATUS_LABELS } from "@myjobhunter/api-client/constants/resumeJobStatusLabels";
import { RESUME_JOB_STATUS_TONES } from "@myjobhunter/api-client/constants/resumeJobStatusTones";
import { resumeJobFileName } from "@myjobhunter/api-client/utils/resumeJobFileName";
import { Chip, useTheme } from "@platform/mobile";
import { ActivityIndicator, Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeUploadStatusRowProps } from "../../types/ResumeUploadStatusRowProps";

/** An upload that can't be picked yet, or won't be: its name, its status, and what to do if it failed. */
export default function ResumeUploadStatusRow({ job }: ResumeUploadStatusRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const name = resumeJobFileName(job);
  const status = RESUME_JOB_STATUS_LABELS[job.status];
  const isReading = job.status === "queued" || job.status === "processing";
  return (
    <View
      accessible
      accessibilityLabel={job.status === "failed" ? `${name}, ${status}. ${MESSAGES.readFailed}` : `${name}, ${status}`}
      style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
      testID="resume-upload-status"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: fontSize.sm, fontWeight: "600" }}>
          {name}
        </Text>
        {isReading ? <ActivityIndicator color={colors.mutedForeground} size="small" /> : null}
        <Chip label={status} tone={RESUME_JOB_STATUS_TONES[job.status]} />
      </View>
      {/* The server's own reason can be technical, so the phone says what to do instead. */}
      {job.status === "failed" ? <Text style={{ color: colors.destructiveText, fontSize: fontSize.xs }}>{MESSAGES.readFailed}</Text> : null}
    </View>
  );
}
