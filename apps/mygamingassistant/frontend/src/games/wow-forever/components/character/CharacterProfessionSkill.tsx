import { skillPercent } from "@/games/wow-forever/lib/character/characterProfessions";
import type { CharacterProfession } from "@/games/wow-forever/types/character/characterProfession";

/** A profession's name, skill out of its rank's cap, and a bar. The bar only backs up the number. */
export default function CharacterProfessionSkill({ profession }: { profession: CharacterProfession }) {
  const percent = skillPercent(profession.skill, profession.max_skill);
  return (
    <span className="block w-full space-y-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{profession.name}</span>
        <span className="tabular-nums text-sm" data-testid="character-profession-skill">
          {profession.skill} / {profession.max_skill}
        </span>
      </span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
