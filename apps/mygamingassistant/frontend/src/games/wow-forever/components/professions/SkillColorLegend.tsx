import { SKILL_COLORS } from "@/games/wow-forever/data/professions/foreverChanges";

export default function SkillColorLegend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span className="text-muted-foreground">Recipe colors:</span>
      {SKILL_COLORS.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm ${c.swatch}`} aria-hidden />
          <span>
            <span className="font-medium">{c.label}</span> {c.meaning}
          </span>
        </span>
      ))}
    </p>
  );
}
