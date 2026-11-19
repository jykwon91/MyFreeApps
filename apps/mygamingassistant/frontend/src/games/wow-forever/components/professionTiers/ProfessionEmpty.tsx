import { Button } from "@platform/ui";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";

interface ProfessionEmptyProps {
  message: string;
  testId: string;
  onClear: () => void;
}

/** No row passes the filters. */
export default function ProfessionEmpty({ message, testId, onClear }: ProfessionEmptyProps) {
  return (
    <div className="space-y-3" data-testid={testId}>
      <EmptyStateNote message={message} />
      <Button type="button" variant="secondary" className="min-h-[44px]" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
