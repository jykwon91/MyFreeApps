import { SKILL_MESSAGES as MESSAGES } from "@/constants/skill-messages";
import type { SkillChipProps } from "@/types/profile/skill-chip-props";

/** A skill and its years, with a 44px button that asks to remove it. */
export default function SkillChip({ skill, onRemove }: SkillChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm bg-muted pl-3 rounded-full">
      <span>{skill.name}</span>
      {/* years_experience is number | null; 0 years is a valid distinct value — keep !== null */}
      {skill.years_experience !== null ? (
        <span className="text-xs text-muted-foreground">{skill.years_experience}y</span>
      ) : null}
      <button
        type="button"
        onClick={() => onRemove(skill)}
        className="text-muted-foreground hover:text-destructive transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full"
        aria-label={MESSAGES.removeLabel(skill.name)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}
