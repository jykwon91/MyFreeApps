import { Clock } from "lucide-react";
import type { PendingIdea } from "@/games/wow-forever/types/featureRequests/pendingIdea";

interface MyPendingIdeasProps {
  ideas: readonly PendingIdea[];
}

/** "Your ideas waiting for review" — titles only, from this browser's own list. Hidden when there are none. */
export default function MyPendingIdeas({ ideas }: MyPendingIdeasProps) {
  if (ideas.length === 0) return null;
  return (
    <section aria-labelledby="my-pending-ideas-h" className="space-y-2 rounded-xl border bg-card p-4">
      <h2 id="my-pending-ideas-h" className="text-sm font-semibold">
        Your ideas waiting for review
      </h2>
      <ul className="space-y-1">
        {ideas.map((idea) => (
          <li key={idea.id} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{idea.title}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">They go on the board once I&apos;ve reviewed them.</p>
    </section>
  );
}
