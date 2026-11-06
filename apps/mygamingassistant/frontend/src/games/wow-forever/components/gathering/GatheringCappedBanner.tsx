import { AlertBox } from "@platform/ui";
import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { CappedRank } from "@/games/wow-forever/types/gathering/cappedRank";

interface GatheringCappedBannerProps {
  capped: CappedRank;
  trainer: TrainerNpc;
}

/** "You're capped at 75" — your skill won't go up until you train the next rank. */
export default function GatheringCappedBanner({ capped, trainer }: GatheringCappedBannerProps) {
  return (
    <AlertBox variant="warning">
      <div className="space-y-1" data-testid="capped-banner">
        <p className="font-semibold">You're capped at {capped.current.cap}.</p>
        <p>
          Train {capped.next.name} at {trainer.name} ({trainer.where}); the Junior trainer can't teach it.
        </p>
        <TrainerMapLink npc={trainer} />
      </div>
    </AlertBox>
  );
}
