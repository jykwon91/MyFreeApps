import { RESUME_JOBS_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/resumeJobsPolling";
import { resumesApi, useListResumeJobsQuery } from "@myjobhunter/api-client/store/resumesApi";
import { useStartRefinementSessionMutation } from "@myjobhunter/api-client/store/resumeRefinementApi";
import { completedResumeJobs } from "@myjobhunter/api-client/utils/completedResumeJobs";
import { resumeJobsInFlight } from "@myjobhunter/api-client/utils/resumeJobsInFlight";
import { EmptyState, LoadingButton, useScreenFocused, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { refinementFailure } from "../../lib/refinementFailure";
import type { ResumeStartPanelProps } from "../../types/ResumeStartPanelProps";
import ResumeJobRow from "./ResumeJobRow";
import ResumeStartSkeleton from "./ResumeStartSkeleton";
import ResumeUploadStatusRow from "./ResumeUploadStatusRow";
import { useResumeUpload } from "./useResumeUpload";

/**
 * Picks which parsed upload to refine and starts a session on it, with the website Profile's
 * upload alongside: a new file is read here, and can be picked once it is.
 */
export default function ResumeStartPanel({ onStarted }: ResumeStartPanelProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const isFocused = useScreenFocused();
  const cached = resumesApi.endpoints.listResumeJobs.useQueryState().data;
  // Only while an upload is still being read, and only while it's on screen to see.
  const isReading = isFocused && resumeJobsInFlight(cached ?? []).length > 0;
  const jobs = useListResumeJobsQuery(undefined, { pollingInterval: isReading ? RESUME_JOBS_POLL_INTERVAL_MS : 0, skipPollingIfUnfocused: true });
  const [startSession, { isLoading: isStarting }] = useStartRefinementSessionMutation();
  const uploads = useResumeUpload();
  const [picked, setPicked] = useState<string | null>(null);

  if (jobs.isLoading) return <ResumeStartSkeleton />;
  if (!jobs.data) {
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: () => void jobs.refetch(), isLoading: jobs.isFetching }}
        body={MESSAGES.couldntLoadResumesBody}
        heading={MESSAGES.couldntLoadResumes}
      />
    );
  }

  const completed = completedResumeJobs(jobs.data);
  const unpickable = jobs.data.filter((job) => job.status !== "complete");
  // A file uploaded here is chosen for the person once it's read, unless they chose another.
  const selected = picked ?? (completed.some((job) => job.id === uploads.uploadedId) ? uploads.uploadedId : null);
  const statusRows = unpickable.length > 0 ? (
    <View accessibilityLabel={MESSAGES.uploadsLabel} style={{ gap: spacing.sm }}>
      {unpickable.map((job) => (
        <ResumeUploadStatusRow job={job} key={job.id} />
      ))}
    </View>
  ) : null;

  if (completed.length === 0) {
    const isReadingOne = resumeJobsInFlight(jobs.data).length > 0;
    return (
      <View style={{ gap: spacing.md }}>
        <EmptyState
          action={{ label: MESSAGES.uploadResume, onPress: uploads.upload, isLoading: uploads.isUploading, loadingText: MESSAGES.uploading }}
          body={isReadingOne ? MESSAGES.readingBody : MESSAGES.noResumeBody}
          heading={isReadingOne ? MESSAGES.readingHeading : MESSAGES.noResumeHeading}
        />
        {statusRows}
      </View>
    );
  }

  async function start(): Promise<void> {
    if (!selected) return;
    try {
      const session = await startSession({ source_resume_job_id: selected }).unwrap();
      onStarted(session.id);
    } catch (error) {
      showToast(refinementFailure(error, MESSAGES.couldntStart), "error");
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.pickResume}</Text>
      <View accessibilityLabel={MESSAGES.resumesLabel} accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        {completed.map((job) => (
          <ResumeJobRow isSelected={selected === job.id} job={job} key={job.id} onSelect={() => setPicked(job.id)} />
        ))}
      </View>
      <LoadingButton disabled={!selected} isLoading={isStarting} loadingText={MESSAGES.starting} onPress={start}>
        {MESSAGES.start}
      </LoadingButton>
      {statusRows}
      <View style={{ gap: spacing.xs }}>
        <LoadingButton isLoading={uploads.isUploading} loadingText={MESSAGES.uploading} onPress={uploads.upload} variant="secondary">
          {MESSAGES.uploadAnother}
        </LoadingButton>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, textAlign: "center" }}>{MESSAGES.uploadHint}</Text>
      </View>
    </View>
  );
}
