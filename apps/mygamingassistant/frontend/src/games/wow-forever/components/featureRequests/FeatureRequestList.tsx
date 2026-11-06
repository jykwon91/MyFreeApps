import FeatureRequestCard from "@/games/wow-forever/components/featureRequests/FeatureRequestCard";
import type { MeTooState } from "@/games/wow-forever/types/featureRequests/meTooState";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

interface FeatureRequestListProps {
  stories: readonly PublicStory[];
  mine: ReadonlySet<string>;
  highlight: string | null;
  meToo: MeTooState;
}

/** The board's cards, one `<li>` each — the same shape the skeleton draws. */
export default function FeatureRequestList({ stories, mine, highlight, meToo }: FeatureRequestListProps) {
  return (
    <ul className="space-y-3">
      {stories.map((story) => (
        <li key={story.id} data-section="card">
          <FeatureRequestCard
            story={story}
            mine={mine.has(story.id)}
            highlighted={story.id === highlight}
            voted={meToo.isVoted(story.id)}
            votePending={meToo.isPending(story.id)}
            onToggleVote={() => void meToo.toggle(story.id)}
          />
        </li>
      ))}
    </ul>
  );
}
