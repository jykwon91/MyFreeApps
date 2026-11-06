import { SKILL_COLOR_STYLE } from "@/games/wow-forever/data/professions/gathering/skillColorStyle";
import type { SkillColor } from "@/games/wow-forever/types/gathering/skillColor";

/** "■ Orange" — a node's colour at your skill. */
export default function SkillColorTag({ color }: { color: SkillColor }) {
  const style = SKILL_COLOR_STYLE[color];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={`h-2.5 w-2.5 rounded-sm ${style.swatch}`} aria-hidden />
      {style.label}
    </span>
  );
}
