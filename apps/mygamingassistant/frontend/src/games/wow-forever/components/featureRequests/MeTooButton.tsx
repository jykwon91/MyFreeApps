import { Loader2, ThumbsUp } from "lucide-react";
import clsx from "clsx";
import { playersAskedLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";

interface MeTooButtonProps {
  title: string;
  count: number;
  voted: boolean;
  pending: boolean;
  onToggle: () => void;
}

/** "Me too" — a toggle: pressed reads "You asked too", and tapping again takes the vote back. */
export default function MeTooButton({ title, count, voted, pending, onToggle }: MeTooButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={voted}
      aria-busy={pending}
      aria-label={`Me too, ${playersAskedLabel(count)}, ${title}`}
      onClick={() => {
        if (!pending) onToggle();
      }}
      className={clsx(
        "inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        voted && "border-primary bg-primary text-primary-foreground",
        !voted && "bg-card hover:bg-muted/40",
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
      ) : (
        <ThumbsUp className="h-4 w-4" aria-hidden />
      )}
      {voted ? "You asked too" : "Me too"}
    </button>
  );
}
