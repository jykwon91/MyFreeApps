import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";

export interface ShowMoreButtonProps {
  remaining: number;
  onClick: () => void;
  testId: string;
}

/** Lists the next page of a capped list; nothing when the whole list is showing. */
export default function ShowMoreButton({ remaining, onClick, testId }: ShowMoreButtonProps) {
  if (remaining === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-primary hover:underline"
      data-testid={testId}
    >
      {MSG.showMore(remaining)}
    </button>
  );
}
