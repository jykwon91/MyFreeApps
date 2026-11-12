import { REFINEMENT_COMPLETION_COPY } from "@myjobhunter/api-client/constants/refinementCompletionCopy";
import { REFINEMENT_TOASTS } from "@myjobhunter/api-client/constants/refinementToasts";
import { useCompleteRefinementSessionMutation } from "@myjobhunter/api-client/store/resumeRefinementApi";
import { ExportFormat } from "@myjobhunter/api-client/types/resume-refinement/export-format";
import { refinementCompletion } from "@myjobhunter/api-client/utils/refinementCompletion";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { Text } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { refinementFailure } from "../../lib/refinementFailure";
import type { ResumeCompleteCardProps } from "../../types/ResumeCompleteCardProps";
import ResumeCard from "./ResumeCard";

/** Once every suggestion is through: mark the resume done, then download it as a PDF or a Word file. */
export default function ResumeCompleteCard({ session, exports }: ResumeCompleteCardProps) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [completeSession, { isLoading: isCompleting }] = useCompleteRefinementSessionMutation();
  const completion = refinementCompletion(session);
  if (completion === "hidden") return null;
  const copy = REFINEMENT_COMPLETION_COPY[completion];

  async function complete(): Promise<void> {
    try {
      await completeSession(session.id).unwrap();
      showToast(REFINEMENT_TOASTS.markedDone);
    } catch (error) {
      showToast(refinementFailure(error, MESSAGES.couldntMarkDone), "error");
    }
  }

  return (
    <ResumeCard testID="resume-complete" tone="success">
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
        {copy.heading}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{copy.body}</Text>
      {completion === "completed" ? (
        <>
          <LoadingButton
            disabled={exports.downloading !== null && exports.downloading !== ExportFormat.PDF}
            isLoading={exports.downloading === ExportFormat.PDF}
            loadingText={MESSAGES.preparingDownload}
            onPress={() => exports.download(ExportFormat.PDF)}
          >
            {MESSAGES.downloadPdf}
          </LoadingButton>
          <LoadingButton
            disabled={exports.downloading !== null && exports.downloading !== ExportFormat.DOCX}
            isLoading={exports.downloading === ExportFormat.DOCX}
            loadingText={MESSAGES.preparingDownload}
            onPress={() => exports.download(ExportFormat.DOCX)}
            variant="secondary"
          >
            {MESSAGES.downloadDocx}
          </LoadingButton>
        </>
      ) : (
        <LoadingButton isLoading={isCompleting} loadingText={MESSAGES.markingDone} onPress={complete}>
          {MESSAGES.markDone}
        </LoadingButton>
      )}
    </ResumeCard>
  );
}
