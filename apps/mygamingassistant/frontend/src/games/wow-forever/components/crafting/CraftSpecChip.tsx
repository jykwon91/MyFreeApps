/** A recipe only one specialization can learn: "Armorsmith only". The word carries the meaning, not a color. */
export default function CraftSpecChip({ name }: { name: string }) {
  return (
    <span className="inline-block rounded border border-primary/40 px-1.5 py-0.5 text-xs font-normal align-middle" data-testid="spec-chip">
      {name} only
    </span>
  );
}
