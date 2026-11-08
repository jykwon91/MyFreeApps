import { describe, expect, it } from "vitest";
import spellsJson from "@/games/wow-forever/data/downrank/spells.json";
import { levelCap } from "@/games/wow-forever/data/levelCap";
import {
  bestRanks,
  downrankFactor,
  downrankRow,
  downrankRows,
  levelsGained,
  macroLine,
  spellSeconds,
} from "@/games/wow-forever/lib/downrank/downrankMath";
import { defaultFamilyId, parseDownrankSettings, writeDownrankSettings } from "@/games/wow-forever/lib/downrank/downrankParams";
import { mergeDownrankFiles } from "@/games/wow-forever/lib/downrank/loadDownrank";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";
import type { DownrankFile } from "@/games/wow-forever/types/downrank/downrankFile";
import type { DownrankRank } from "@/games/wow-forever/types/downrank/downrankRank";
import type { DownrankSettings } from "@/games/wow-forever/types/downrank/downrankSettings";

const FILE = spellsJson as DownrankFile;
const FAMILIES = FILE.families;

function family(id: string): DownrankFamily {
  const found = FAMILIES.find((f) => f.id === id);
  if (!found) throw new Error(`no family ${id}`);
  return found;
}

function rank(id: string, number: number): DownrankRank {
  const found = family(id).ranks.find((r) => r.rank === number);
  if (!found) throw new Error(`no ${id} Rank ${number}`);
  return found;
}

function settings(patch: Partial<DownrankSettings> = {}): DownrankSettings {
  return { familyId: "priest-heal", level: 60, bonus: 0, talentPct: 0, manaPct: 0, lowLevelPenalty: true, ...patch };
}

describe("downrank math — Classic's rules on Forever's numbers", () => {
  it("Heal Rank 1 at 60 keeps 0.857 × 0.85 × 26/60 of your bonus", () => {
    const row = downrankRow(rank("priest-heal", 1), settings({ bonus: 1000 }));
    expect(row.effectiveCoefficient).toBeCloseTo(0.3157, 4);
    expect(row.bonusAdded).toBeCloseTo(315.7, 1);
    // 270 + 2 a level for the 5 levels to its max level 21, then no more.
    expect(row.baseAvg).toBe(280);
    expect(row.amount).toBeCloseTo(595.7, 1);
    expect(row.perMana).toBeCloseTo(row.amount / 155, 6);
  });

  it("matches the Forever tooltip's roll at the learn level", () => {
    const row = downrankRow(rank("priest-heal", 1), settings({ level: 16 }));
    expect([row.baseMin, row.baseMax]).toEqual([250, 290]);
    expect(row.penaltyFactor).toBeCloseTo(0.85);
  });

  it("switches the below-level-20 penalty off", () => {
    const row = downrankRow(rank("priest-heal", 1), settings({ bonus: 1000, lowLevelPenalty: false }));
    expect(row.effectiveCoefficient).toBeCloseTo((0.857 * 26) / 60, 4);
  });

  it("starts the downranking penalty past max level + 5", () => {
    const heal1 = rank("priest-heal", 1);
    expect(heal1.fullBonusUntil).toBe(26);
    expect(downrankFactor(heal1, 26)).toBe(1);
    expect(downrankFactor(heal1, 27)).toBeCloseTo(26 / 27);
    expect(levelsGained(heal1, 18)).toBe(2);
    expect(levelsGained(heal1, 60)).toBe(5);
  });

  it("counts every tick of a heal over time", () => {
    const renew = rank("priest-renew", 1);
    const row = downrankRow(renew, settings({ familyId: "priest-renew", level: renew.level, bonus: 100, lowLevelPenalty: false }));
    expect(renew.periodic).not.toBeNull();
    const ticks = renew.periodic?.ticks ?? 0;
    expect(row.baseAvg).toBe((renew.periodic?.tick ?? 0) * ticks);
    expect(row.effectiveCoefficient).toBeCloseTo((renew.periodic?.coefficient ?? 0) * ticks);
  });

  it("divides by the cast (never under the global cooldown), or by a tick-only spell's duration", () => {
    expect(spellSeconds(rank("priest-heal", 1))).toBe(3);
    expect(spellSeconds(rank("priest-flash-heal", 1))).toBe(1.5);
    expect(spellSeconds(rank("priest-renew", 1))).toBe(15);
    // Regrowth lands at once too, so its cast counts, not its heal over time.
    expect(spellSeconds(rank("druid-regrowth", 1))).toBe(2);
  });

  it("applies talents to the whole amount and to the mana", () => {
    const plain = downrankRow(rank("priest-heal", 4), settings({ bonus: 200 }));
    const talented = downrankRow(rank("priest-heal", 4), settings({ bonus: 200, talentPct: 10, manaPct: 15 }));
    expect(talented.amount).toBeCloseTo(plain.amount * 1.1);
    expect(talented.mana).toBeCloseTo(plain.mana * 0.85);
  });
});

describe("downrank highlights", () => {
  it("moves Greater Heal's best rank per mana down as +healing rises", () => {
    const greater = family("priest-greater-heal");
    expect(bestRanks(downrankRows(greater.ranks, settings({ bonus: 0 })))).toEqual({ perMana: 5, perSecond: 5 });
    expect(bestRanks(downrankRows(greater.ranks, settings({ bonus: 600 })))).toEqual({ perMana: 3, perSecond: 5 });
  });

  it("only picks ranks you can have at your level", () => {
    const heal = family("priest-heal");
    expect(bestRanks(downrankRows(heal.ranks, settings({ level: 20 })))).toEqual({ perMana: 1, perSecond: 1 });
    const greater = family("priest-greater-heal");
    const early = downrankRows(greater.ranks, settings({ level: greater.ranks[0].level - 1 }));
    expect(early.every((r) => !r.learnable)).toBe(true);
    expect(bestRanks(early)).toEqual({ perMana: null, perSecond: null });
  });

  it("writes the macro line that casts a rank", () => {
    expect(macroLine("Heal", 2)).toBe("/cast Heal(Rank 2)");
  });
});

describe("downrank data", () => {
  it("fills Classic ranks in rank order", () => {
    const heal = family("priest-heal");
    const [first, ...rest] = heal.ranks;
    const merged = mergeDownrankFiles(
      { ...FILE, families: [{ ...heal, ranks: rest }] },
      { source: "", families: [{ id: heal.id, ranks: [{ ...first, from: "classic" }] }] },
    );
    expect(merged[0].ranks.map((r) => r.rank)).toEqual(heal.ranks.map((r) => r.rank));
    expect(merged[0].ranks[0].from).toBe("classic");
  });
});

describe("downrank URL", () => {
  const fallback = { classId: null, level: null };

  it("round-trips every setting", () => {
    const wanted = settings({ familyId: "mage-frostbolt", level: 42, bonus: 350, talentPct: 10, manaPct: 5, lowLevelPenalty: false });
    const params = writeDownrankSettings(new URLSearchParams("keep=1"), wanted);
    expect(params.toString()).toBe("keep=1&spell=mage-frostbolt&lvl=42&bonus=350&tal=10&mana=5&p20=0");
    expect(parseDownrankSettings(params, FAMILIES, fallback)).toEqual(wanted);
  });

  it("leaves zeros and the default penalty out", () => {
    const params = writeDownrankSettings(new URLSearchParams("bonus=5&tal=3&p20=0"), settings());
    expect(params.toString()).toBe("spell=priest-heal&lvl=60");
  });

  it("falls back to the saved class and level, else the priest and the level cap", () => {
    const empty = new URLSearchParams();
    const saved = parseDownrankSettings(empty, FAMILIES, { classId: "shaman", level: 33 });
    expect([saved.familyId, saved.level]).toEqual(["shaman-healing-wave", 33]);
    const warrior = parseDownrankSettings(empty, FAMILIES, { classId: "warrior", level: null });
    expect([warrior.familyId, warrior.level]).toEqual(["priest-lesser-heal", levelCap()]);
    expect(defaultFamilyId(FAMILIES, null)).toBe("priest-lesser-heal");
  });

  it("ignores an unknown spell and clamps bad numbers", () => {
    const parsed = parseDownrankSettings(new URLSearchParams("spell=nope&lvl=abc&bonus=-5&tal=500&mana=x"), FAMILIES, fallback);
    expect(parsed).toEqual(settings({ familyId: "priest-lesser-heal", level: levelCap(), bonus: 0, talentPct: 100, manaPct: 0 }));
  });
});
