import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ClassProficiency } from "@/games/wow-forever/types/classProficiency";

interface ClassProficienciesSectionProps {
  proficiency: ClassProficiency;
}

/** Armor and weapon proficiencies for a class — from Classic-verified data. */
export default function ClassProficienciesSection({ proficiency }: ClassProficienciesSectionProps) {
  const armor = buildArmorLabel(proficiency);
  const weapons = buildWeaponsLabel(proficiency);

  return (
    <section aria-labelledby="class-proficiencies-heading" className="space-y-2">
      <h2 id="class-proficiencies-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Proficiencies
      </h2>
      <div className="rounded-xl border bg-card p-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <span className="font-medium shrink-0">Armor</span>
          <span className="text-muted-foreground">{armor}</span>
          <ProvenanceBadge provenance={PROVENANCE.classic} />
        </div>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <span className="font-medium shrink-0">Weapons</span>
          <span className="text-muted-foreground">{weapons}</span>
          <ProvenanceBadge provenance={PROVENANCE.classic} />
        </div>
        {proficiency.shield ? (
          <div className="text-muted-foreground">
            Shield
          </div>
        ) : null}
        {proficiency.dualWieldLevel !== null ? (
          <div className="text-muted-foreground">
            Dual wield{proficiency.dualWieldLevel > 1 ? ` (trains at level ${proficiency.dualWieldLevel})` : ""}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function buildArmorLabel(p: ClassProficiency): string {
  const types = [...p.armor];
  if (p.heavyArmor) {
    return `${types.join(", ")}, ${p.heavyArmor.type} (trains at level ${p.heavyArmor.level})`;
  }
  return types.join(", ");
}

function buildWeaponsLabel(p: ClassProficiency): string {
  const all = new Set([...p.oneHand, ...p.twoHand, ...p.ranged]);
  return [...all].join(", ") || "None";
}
