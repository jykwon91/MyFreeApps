import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  EmptyState,
  LoadingButton,
  Skeleton,
  showError,
  extractErrorMessage,
} from "@platform/ui";
import { useListResumeJobsQuery } from "@/lib/resumesApi";
import { useStartRefinementSessionMutation } from "@/lib/resumeRefinementApi";
import ResumeJobOption from "@/features/resume_refinement/ResumeJobOption";

interface SessionStartPanelProps {
  onSessionStarted: (sessionId: string) => void;
}

export default function SessionStartPanel({ onSessionStarted }: SessionStartPanelProps) {
  const navigate = useNavigate();
  const { data: jobs, isLoading } = useListResumeJobsQuery();
  const [startSession, { isLoading: isStarting }] = useStartRefinementSessionMutation();
  const [picked, setPicked] = useState<string | null>(null);

  const completedJobs = (jobs ?? []).filter((j) => j.status === "complete");

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
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
      showError(extractErrorMessage(err));
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
