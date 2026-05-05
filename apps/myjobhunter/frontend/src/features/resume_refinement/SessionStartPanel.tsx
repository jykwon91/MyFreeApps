import { useState } from "react";
import { Link } from "react-router-dom";
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
import type { ResumeUploadJob } from "@/types/resume-upload-job/resume-upload-job";

interface SessionStartPanelProps {
  onSessionStarted: (sessionId: string) => void;
}

export default function SessionStartPanel({ onSessionStarted }: SessionStartPanelProps) {
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
        body={
          <span>
            The refinement loop iterates on a resume you've already uploaded and
            parsed. Head to{" "}
            <Link to="/profile" className="underline">
              Profile
            </Link>{" "}
            to upload one, then come back.
          </span>
        }
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
          disabled={!picked}
          onClick={handleStart}
        >
          Start refinement
        </LoadingButton>
      </div>
    </div>
  );
}

interface ResumeJobOptionProps {
  job: ResumeUploadJob;
  selected: boolean;
  onSelect: () => void;
}

function ResumeJobOption({ job, selected, onSelect }: ResumeJobOptionProps) {
  const fields = job.result_parsed_fields;
  const summary = fields
    ? `${fields.work_history_count} role${fields.work_history_count === 1 ? "" : "s"}, ${fields.skills_count} skills`
    : "Parsed resume";
  const filename = job.file_filename ?? "resume";
  const uploaded = new Date(job.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-md border p-3 transition ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
      }`}
    >
      <div className="text-sm font-medium">{filename}</div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {summary} · uploaded {uploaded}
      </div>
    </button>
  );
}
