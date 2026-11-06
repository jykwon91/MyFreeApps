import { Link } from "react-router-dom";
import StoryCard from "@/games/wow-forever/components/featureRequests/StoryCard";
import MeTooButton from "@/games/wow-forever/components/featureRequests/MeTooButton";
import { isSitePath, isVotableStatus } from "@/games/wow-forever/lib/featureRequests/featureRequestGuards";
import { playersAskedLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

interface FeatureRequestCardProps {
  story: PublicStory;
  mine: boolean;
  highlighted: boolean;
  voted: boolean;
  votePending: boolean;
  onToggleVote: () => void;
}

/** A story on the board: the story, the operator's note, the shipped link, and how many asked — with "Me too". */
export default function FeatureRequestCard({ story, mine, highlighted, voted, votePending, onToggleVote }: FeatureRequestCardProps) {
  const notPlanned = story.status === "not_planned";
  return (
    <StoryCard story={story} status={story.status} mine={mine} expanded={false} highlighted={highlighted}>
      {story.operator_note !== null ? (
        <p className="text-sm">
          <span className="font-medium">{notPlanned ? "Why not: " : "Note: "}</span>
          {story.operator_note}
        </p>
      ) : null}
      {story.status === "shipped" && story.shipped_path !== null && isSitePath(story.shipped_path) ? (
        <Link to={story.shipped_path} className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary">
          Shipped — try it →
        </Link>
      ) : null}
      <div data-row="votes" className="flex items-center justify-between gap-2 pt-1">
        <span className="text-sm text-muted-foreground">{playersAskedLabel(story.vote_count)}</span>
        {isVotableStatus(story.status) ? (
          <MeTooButton
            title={story.title}
            count={story.vote_count}
            voted={voted}
            pending={votePending}
            onToggle={onToggleVote}
          />
        ) : null}
      </div>
    </StoryCard>
  );
}
