/** Marks a fact not yet confirmed in Forever. The word carries the meaning, not a color. */
export default function UnconfirmedChip() {
  return (
    <span className="inline-block rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground align-middle">
      Unconfirmed
    </span>
  );
}
