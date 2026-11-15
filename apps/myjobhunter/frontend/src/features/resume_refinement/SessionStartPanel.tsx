import { aiActionErrorMessage } from "@/lib/aiActionErrorMessage";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  EmptyState,
  LoadingButton,
  Skeleton,
  showError,
} from "@platform/ui";
import { resumesApi, useListResumeJobsQuery } from "@myjobhunter/api-client/store/resumesApi";
import { RESUME_JOBS_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/resumeJobsPolling";
import { useStartRefinementSessionMutation } from "@myjobhunter/api-client/store/resumeRefinementApi";
import { completedResumeJobs } from "@myjobhunter/api-client/utils/completedResumeJobs";
import { resumeJobsInFlight } from "@myjobhunter/api-client/utils/resumeJobsInFlight";
import ResumeJobOption from "@/features/resume_refinement/ResumeJobOption";

interface SessionStartPanelProps {
  onSessionStarted: (sessionId: string) => void;
}

export default function SessionStartPanel({ onSessionStarted }: SessionStartPanelProps) {
  const navigate = useNavigate();
  const cached = resumesApi.endpoints.listResumeJobs.useQueryState().data;
  // Poll only while an upload is still being read, so it appears here once it finishes.
  const isReading = resumeJobsInFlight(cached ?? []).length > 0;
  const { data: jobs, isLoading } = useListResumeJobsQuery(undefined, {
    pollingInterval: isReading ? RESUME_JOBS_POLL_INTERVAL_MS : 0,
    skipPollingIfUnfocused: true,
  });
  const [startSession, { isLoading: isStarting }] = useStartRefinementSessionMutation();
  const [picked, setPicked] = useState<string | null>(null);

  const completedJobs = completedResumeJobs(jobs);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (completedJobs.length === 0 && isReading) {
    return (
      <EmptyState
        icon={<Sparkles className="size-8 text-muted-foreground" />}
        heading="Reading your resume"
        body="This usually takes under a minute. It shows up here to pick once it's read."
      />
    );
  }

  if (completedJobs.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="size-8 text-muted-foreground" />}
        heading="Upload a resume first"
        body="The refinement loop iterates on a resume you've already uploaded and parsed. Head to Profile to upload one, then come back."
        action={{ label: "Go to Profile", onClick: () => navigate("/profile") }}
      />
    );
  }

  async function handleStart() {
    if (!picked) return;
    try {
      const session = await startSession({ source_resume_job_id: picked }).unwrap();
      onSessionStarted(session.id);
    } catch (err) {
      showError(aiActionErrorMessage(err, "resumeRefinement"));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pick the resume you want to refine. We'll critique it, suggest specific
        rewrites, and you'll iterate until you're happy.
      </p>
      <div className="space-y-2">
        {completedJobs.map((job) => (
          <ResumeJobOption
            key={job.id}
            job={job}
            selected={picked === job.id}
            onSelect={() => setPicked(job.id)}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <LoadingButton
          isLoading={isStarting}
          loadingText="Starting…"
          disabled={!picked}
          onClick={handleStart}
        >
          Start refinement
        </LoadingButton>
      </div>
    </div>
  );
}
