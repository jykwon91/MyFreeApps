/** A column of gear-row placeholders for the character sheet's skeleton. */
export default function CharacterRowSkeletons({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[52px] rounded-lg bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}
