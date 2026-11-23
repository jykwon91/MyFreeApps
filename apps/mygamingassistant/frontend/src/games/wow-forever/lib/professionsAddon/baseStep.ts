import type { AddonStep, AddonStepKind } from "@/games/wow-forever/types/professionsAddon/addonStep";

/** A step with every optional field empty, for a builder to fill in. */
export function baseStep(kind: AddonStepKind, from: number, to: number, name: string, confirmed: boolean): AddonStep {
  return {
    kind,
    from,
    to,
    name,
    spell: null,
    yellow: null,
    grey: null,
    mats: [],
    learn: null,
    learnSkill: null,
    acquire: false,
    text: null,
    source: null,
    note: null,
    options: [],
    rank: null,
    places: null,
    confirmed,
  };
}
