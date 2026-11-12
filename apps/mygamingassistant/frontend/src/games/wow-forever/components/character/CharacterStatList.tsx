import clsx from "clsx";
import { CHARACTER_BONUS_TEXT } from "@/games/wow-forever/data/character/characterConfig";
import type { CharacterStatLine } from "@/games/wow-forever/types/character/characterStatLine";

interface CharacterStatListProps {
  lines: readonly CharacterStatLine[];
  label: string;
  className?: string;
}

/** Label on the left, number on the right; what gear adds in green beside it. */
export default function CharacterStatList({ lines, label, className }: CharacterStatListProps) {
  return (
    <dl aria-label={label} className={clsx("divide-y divide-border/60 rounded-xl border bg-card text-sm", className)}>
      {lines.map((stat) => (
        <div key={stat.label} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">{stat.label}</dt>
          <dd className="text-right font-medium tabular-nums">
            {stat.value}
            {stat.bonus ? (
              <span className={clsx("ml-1.5 text-xs font-normal", CHARACTER_BONUS_TEXT)}>
                ({stat.bonus}
                <span className="sr-only"> from gear, talents and buffs</span>)
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
