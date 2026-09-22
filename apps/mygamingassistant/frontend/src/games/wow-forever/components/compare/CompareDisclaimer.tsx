import { AlertBox } from "@platform/ui";

/** Shown above every score — the numbers are estimates, and Forever's are unknown. */
export default function CompareDisclaimer() {
  return (
    <AlertBox variant="warning">
      <p className="font-medium">Scores are approximate.</p>
      <p className="mt-1">
        Forever's stat values aren't published yet, and talents are being reworked. Level 60 scores use
        Pawn's Classic Era stat weights; leveling scores use a simple rule of thumb. Use the result as a
        guide, not a final answer.
      </p>
    </AlertBox>
  );
}
