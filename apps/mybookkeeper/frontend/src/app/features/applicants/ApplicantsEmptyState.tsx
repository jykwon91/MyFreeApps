import EmptyState from "@/shared/components/ui/EmptyState";

export interface ApplicantsEmptyStateProps {
  isFiltered: boolean;
}

export default function ApplicantsEmptyState({ isFiltered }: ApplicantsEmptyStateProps) {
  return (
    <EmptyState
      message={
        isFiltered
          ? "No applicants in this stage. Try a different filter."
          : "No applicants yet — they'll show up here once you promote an inquiry."
      }
    />
  );
}
