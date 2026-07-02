import SessionStartPanel from "@/features/resume_refinement/SessionStartPanel";
import ResumeRefinementHeader from "@/features/resume_refinement/ResumeRefinementHeader";

interface NoSessionViewProps {
  onSessionStarted: (id: string) => void;
}

export default function NoSessionView({ onSessionStarted }: NoSessionViewProps) {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <ResumeRefinementHeader />
      <SessionStartPanel onSessionStarted={onSessionStarted} />
    </main>
  );
}
