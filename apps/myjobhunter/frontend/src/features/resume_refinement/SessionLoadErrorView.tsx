import ResumeRefinementHeader from "@/features/resume_refinement/ResumeRefinementHeader";

interface SessionLoadErrorViewProps {
  onStartNew: () => void;
}

export default function SessionLoadErrorView({ onStartNew }: SessionLoadErrorViewProps) {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <ResumeRefinementHeader />
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        We couldn't load that session.{" "}
        <button type="button" onClick={onStartNew} className="underline">
          Start a new one
        </button>
        .
      </div>
    </main>
  );
}
