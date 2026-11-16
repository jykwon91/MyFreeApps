import { useLazyGetResumeDownloadUrlQuery } from "@myjobhunter/api-client/store/resumesApi";
import { documentDownloadUrl } from "@myjobhunter/api-client/utils/documentDownloadUrl";
import { resumeJobFileName } from "@myjobhunter/api-client/utils/resumeJobFileName";
import { LoadingButton, useOpenLink, useToast } from "@platform/mobile";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { writeFailure } from "../../lib/writeFailure";
import type { ResumeDownloadButtonProps } from "../../types/ResumeDownloadButtonProps";

/** Opens the file as it was uploaded, from a short-lived signed link fetched on each press. */
export default function ResumeDownloadButton({ job }: ResumeDownloadButtonProps) {
  const { showToast } = useToast();
  const openLink = useOpenLink();
  const [getDownloadUrl] = useLazyGetResumeDownloadUrlQuery();

  async function download(): Promise<void> {
    try {
      // The link expires, so it's fetched fresh each time.
      const url = documentDownloadUrl(await getDownloadUrl(job.id).unwrap());
      if (url) await openLink(url);
      else showToast(MESSAGES.unsafeDownload, "error");
    } catch (error) {
      showToast(writeFailure(error, MESSAGES.couldntDownloadOriginal, MESSAGES.uploadGone), "error");
    }
  }

  return (
    <LoadingButton
      accessibilityLabel={MESSAGES.downloadOriginalOf(resumeJobFileName(job))}
      loadingText={MESSAGES.openingOriginal}
      onPress={download}
      style={{ flex: 1 }}
      variant="secondary"
    >
      {MESSAGES.downloadOriginal}
    </LoadingButton>
  );
}
