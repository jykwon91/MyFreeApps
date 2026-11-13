import clsx from "clsx";

interface CharacterRowSkeletonsProps {
  count: number;
  /** A Tailwind height; gear rows by default. */
  height?: string;
}

/** A column of row placeholders for the character sheet's skeleton. */
export default function CharacterRowSkeletons({ count, height = "h-[52px]" }: CharacterRowSkeletonsProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={clsx(height, "rounded-lg bg-muted animate-pulse")} />
      ))}
    </div>
  );
}
