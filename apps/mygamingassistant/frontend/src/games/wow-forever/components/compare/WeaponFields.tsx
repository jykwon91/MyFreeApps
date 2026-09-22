import { useState } from "react";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { weaponDps } from "@/games/wow-forever/scoring/weaponDps";
import type { WeaponStats } from "@/games/wow-forever/types/compareItem";

interface WeaponFieldsProps {
  weapon: WeaponStats | null;
  onChange: (weapon: WeaponStats | null) => void;
}

interface Draft {
  minDamage: number | null;
  maxDamage: number | null;
  speed: number | null;
}

function toDraft(weapon: WeaponStats | null): Draft {
  return { minDamage: weapon?.minDamage ?? null, maxDamage: weapon?.maxDamage ?? null, speed: weapon?.speed ?? null };
}

function toWeapon(d: Draft): WeaponStats | null {
  if (d.minDamage === null || d.maxDamage === null || d.speed === null) return null;
  if (d.speed <= 0 || d.maxDamage < d.minDamage || d.minDamage < 0) return null;
  return { minDamage: d.minDamage, maxDamage: d.maxDamage, speed: d.speed };
}

/** Damage range + speed. The item only gets weapon DPS once all three are valid. */
export default function WeaponFields({ weapon, onChange }: WeaponFieldsProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(weapon));
  const [lastWeapon, setLastWeapon] = useState(weapon);
  if (weapon !== lastWeapon) {
    setLastWeapon(weapon);
    if (weapon !== null) setDraft(toDraft(weapon));
  }

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(toWeapon(next));
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Min damage" value={draft.minDamage} onChange={(v) => update({ minDamage: v })} min={0} />
        <NumberField label="Max damage" value={draft.maxDamage} onChange={(v) => update({ maxDamage: v })} min={0} />
        <NumberField label="Speed" value={draft.speed} step={0.01} onChange={(v) => update({ speed: v })} min={0} />
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {weapon ? `${weaponDps(weapon)} damage per second` : "Enter damage and speed to score weapon DPS."}
      </p>
    </div>
  );
}
