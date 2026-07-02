import { Skeleton } from "@platform/ui";
import ResumeRefinementHeader from "@/features/resume_refinement/ResumeRefinementHeader";

export default function SessionLoadingView() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <ResumeRefinementHeader />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}
