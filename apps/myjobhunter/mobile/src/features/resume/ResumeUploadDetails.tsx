import { resumeJobMeta } from "@myjobhunter/api-client/utils/resumeJobMeta";
import { resumeJobParsedResults } from "@myjobhunter/api-client/utils/resumeJobParsedResults";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeUploadDetailsProps } from "../../types/ResumeUploadDetailsProps";
import ResumeDownloadButton from "./ResumeDownloadButton";
import ResumeParsedPanel from "./ResumeParsedPanel";

/** An upload's time and size, the original file to download, and for a read one what was read from it. */
export default function ResumeUploadDetails({ job }: ResumeUploadDetailsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const parsed = resumeJobParsedResults(job);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{resumeJobMeta(job)}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {parsed ? (
          <LoadingButton accessibilityState={{ expanded: isExpanded }} onPress={() => setIsExpanded((open) => !open)} style={{ flex: 1 }} variant="ghost">
            {isExpanded ? MESSAGES.hideParsed : MESSAGES.showParsed}
          </LoadingButton>
        ) : null}
        <ResumeDownloadButton job={job} />
      </View>
      {parsed && isExpanded ? <ResumeParsedPanel parsed={parsed} /> : null}
    </View>
  );
}
