import { AlertBox } from "@platform/ui";
import { OutboundLink } from "@platform/ui/discord-activity";
import { PUBLISHED_LIST, RAIDS_OPEN_LABEL } from "@/games/wow-forever/data/gear/gearPageConfig";

/** What phase this is for, what the scores rest on, and why the order is only approximate. */
export default function GearPhaseBanner() {
  return (
    <AlertBox variant="info">
      <div className="space-y-2" data-testid="gear-phase-banner">
        <p>
          <strong>Pre-raid phase.</strong> Raids open on {RAIDS_OPEN_LABEL}, so raid loot isn&apos;t listed. Scores use
          Classic&apos;s Pawn stat weights: Forever hasn&apos;t published its stat values or hit cap, so the ranking is
          approximate. Drop rates and set bonuses aren&apos;t shown.
        </p>
        <p>
          Compare with a published list:{" "}
          <OutboundLink href={PUBLISHED_LIST.url} className="underline underline-offset-2">
            {PUBLISHED_LIST.name}&apos;s WoW Forever BiS lists
          </OutboundLink>{" "}
          (checked {PUBLISHED_LIST.checked}).
        </p>
      </div>
    </AlertBox>
  );
}
