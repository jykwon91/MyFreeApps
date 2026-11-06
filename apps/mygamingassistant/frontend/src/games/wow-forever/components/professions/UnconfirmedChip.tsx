import { UNCONFIRMED_LABEL } from "@/games/wow-forever/data/professions/confidenceBasisLabel";

/** Marks a fact not yet confirmed in Forever. The word carries the meaning, not a color. */
export default function UnconfirmedChip({ label = UNCONFIRMED_LABEL }: { label?: string }) {
  return (
    <span className="inline-block rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground align-middle">
      {label}
    </span>
  );
}
