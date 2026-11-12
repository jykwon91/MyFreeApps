import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import CharacterProfessionRecipes from "@/games/wow-forever/components/character/CharacterProfessionRecipes";
import CharacterProfessionSkill from "@/games/wow-forever/components/character/CharacterProfessionSkill";
import { formatRecipeCount, hasRecipeList } from "@/games/wow-forever/lib/character/characterProfessions";
import type { CharacterProfession } from "@/games/wow-forever/types/character/characterProfession";

interface CharacterProfessionCardProps {
  profession: CharacterProfession;
  open: boolean;
  onToggle: () => void;
}

/** One profession: its skill, and (when it knows more than one thing) a button that lists its recipes. */
export default function CharacterProfessionCard({ profession, open, onToggle }: CharacterProfessionCardProps) {
  const panelId = useId();
  if (!hasRecipeList(profession.recipes)) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3" data-testid="character-profession">
        <CharacterProfessionSkill profession={profession} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card" data-testid="character-profession">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 space-y-1">
          <CharacterProfessionSkill profession={profession} />
          <span className="block text-xs text-muted-foreground">{formatRecipeCount(profession.recipes.length)}</span>
        </span>
        <ChevronDown aria-hidden className={clsx("h-4 w-4 shrink-0", open && "rotate-180")} />
      </button>
      <div id={panelId} role="region" aria-label={`${profession.name} recipes`} hidden={!open} className="border-t px-4 py-3">
        {open && <CharacterProfessionRecipes profession={profession} />}
      </div>
    </div>
  );
}
