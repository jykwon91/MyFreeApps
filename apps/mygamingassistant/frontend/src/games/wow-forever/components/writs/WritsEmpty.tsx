import { Button } from "@platform/ui";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";

/** No writ passes the filters. */
export default function WritsEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="space-y-3" data-testid="writs-empty">
      <EmptyStateNote message="No writs match these filters" />
      <Button type="button" variant="secondary" className="min-h-[44px]" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
