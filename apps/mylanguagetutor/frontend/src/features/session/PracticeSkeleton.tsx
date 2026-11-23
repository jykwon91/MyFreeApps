import { LoadingRegion, Skeleton } from "@platform/ui";
import {
  PRACTICE_COMPOSER,
  PRACTICE_HEADER,
  PRACTICE_PAGE,
  PRACTICE_SECTION_IDS,
  PRACTICE_START_PROMPT,
  PRACTICE_TRANSCRIPT,
} from "@/constants/practiceLayout";

interface PracticeSkeletonProps {
  /** What a screen reader hears while this loads. */
  label: string;
}

/**
 * Mirrors PracticeSession's sections in order: the scenario title, its goal line and
 * goals; the still-empty transcript with its start prompt; and the microphone composer.
 */
export default function PracticeSkeleton({ label }: PracticeSkeletonProps) {
  return (
    <LoadingRegion label={label} className={PRACTICE_PAGE}>
      <div className={PRACTICE_HEADER} data-testid={PRACTICE_SECTION_IDS.header}>
        <Skeleton className="h-7 w-2/3 max-w-sm" />
        <Skeleton className="h-5 w-4/5 max-w-md" />
        <Skeleton className="h-4 w-1/2 max-w-xs" />
      </div>
      <div className={PRACTICE_TRANSCRIPT} data-testid={PRACTICE_SECTION_IDS.transcript}>
        <div className={PRACTICE_START_PROMPT}>
          <Skeleton className="mx-auto h-5 w-3/4 max-w-sm" />
        </div>
      </div>
      <div className={PRACTICE_COMPOSER} data-testid={PRACTICE_SECTION_IDS.composer}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex min-h-[44px] items-center">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
