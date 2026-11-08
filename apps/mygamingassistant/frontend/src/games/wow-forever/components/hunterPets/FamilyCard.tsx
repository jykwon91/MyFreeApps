import clsx from "clsx";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { formatSignedPercent } from "@/games/wow-forever/lib/hunterPets/formatHunterPets";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { HunterFamily } from "@/games/wow-forever/types/hunterPets/hunterFamily";

interface FamilyCardProps {
  family: HunterFamily;
  selected: boolean;
  /** Abilities this family can learn. */
  abilityCount: number;
  onToggle: () => void;
}

/** One family: icon, modifiers and diet. Pressing it narrows the abilities and beasts to this family. */
export default function FamilyCard({ family, selected, abilityCount, onToggle }: FamilyCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      data-testid="family-card"
      data-family={family.slug}
      className={clsx(
        "flex min-h-[44px] w-full flex-col gap-2 rounded-xl border bg-card p-3 text-left hover:bg-muted/40",
        selected && "border-primary ring-2 ring-primary",
      )}
    >
      <span className="flex items-center gap-2">
        <GameIcon icon={fileIcon(family.icon)} size={32} alt="" />
        <span className="font-medium">{family.name}</span>
        {family.isNew ? <span className="rounded border px-1.5 text-xs">New in Forever</span> : null}
      </span>
      <span className="text-xs text-muted-foreground">
        Damage {formatSignedPercent(family.damage)} · Armor {formatSignedPercent(family.armor)} · Health{" "}
        {formatSignedPercent(family.health)}
      </span>
      <span className="text-xs text-muted-foreground">
        {family.diet.length > 0 ? `Eats ${family.diet.join(", ").toLowerCase()}` : "No diet"} · {abilityCount} abilities
      </span>
    </button>
  );
}
