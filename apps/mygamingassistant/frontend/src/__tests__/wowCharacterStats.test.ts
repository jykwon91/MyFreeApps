/** The stats panel's line builders: formatting, gear bonus, shown-only-when-it-matters lines, default tab. */
import { describe, expect, it } from "vitest";
import {
  defaultStatsTab,
  formatDamageRange,
  formatPercent,
  parseStatsTab,
  statBonus,
  summaryLines,
  tabLines,
} from "@/games/wow-forever/lib/character/characterStats";
import type { CharacterStats } from "@/games/wow-forever/types/character/characterStats";

const value = (effective: number, base = effective) => ({ base, effective });

const STATS: CharacterStats = {
  health: 1032,
  power: 100,
  power_type: "Rage",
  strength: value(80, 60),
  agility: value(40),
  stamina: value(70),
  intellect: value(20),
  spirit: value(30),
  melee: {
    attack_power: 210,
    main_hand: { min: 30.4, max: 55.6, speed: 2.6, dps: 16.3 },
    off_hand: { min: 15, max: 28, speed: 1.8, dps: 11.9 },
    crit: 6.123,
    hit: 1,
    haste: 2.5,
    expertise: 0,
  },
  ranged: { attack_power: 40, damage: null, crit: 3, hit: 0, haste: 0 },
  spell: { power: 0, healing: 0, crit: 0, hit: 0, haste: 0, penetration: 10, mana_regen: 0, mana_regen_casting: 0 },
  defenses: { armor: value(900, 120), defense: value(190), dodge: 5, parry: 5, block: 0 },
  resistances: { arcane: 0, fire: 0, frost: 0, nature: 0, shadow: 0 },
  movement_speed: 108,
};

const labels = (lines: { label: string }[]) => lines.map((l) => l.label);

describe("stat formatting", () => {
  it("prints percents to two places and damage as whole numbers", () => {
    expect(formatPercent(6.123)).toBe("6.12%");
    expect(formatDamageRange({ min: 30.4, max: 55.6, speed: null, dps: null })).toBe("30 – 56");
  });

  it("shows what gear adds, a loss with a minus, and nothing when they match", () => {
    expect(statBonus(value(80, 60))).toBe("+20");
    expect(statBonus(value(50, 60))).toBe("−10");
    expect(statBonus(value(60))).toBeNull();
  });
});

describe("stat lines", () => {
  it("shows haste only when it isn't zero, and both hands when both hold weapons", () => {
    const melee = labels(tabLines(STATS, "melee"));
    expect(melee).toContain("Haste");
    expect(melee).not.toContain("Expertise");
    expect(melee).toEqual(expect.arrayContaining(["Main hand damage", "Off hand damage", "Off hand speed"]));
  });

  it("has no ranged damage line without a ranged weapon", () => {
    expect(labels(tabLines(STATS, "ranged"))).not.toContain("Ranged damage");
  });

  it("shows spell penetration only when gear gives some", () => {
    expect(labels(tabLines(STATS, "spell"))).toContain("Spell penetration");
  });

  it("names the class's power and shows run speed only when it isn't normal", () => {
    const summary = summaryLines(STATS);
    expect(summary[1]).toMatchObject({ label: "Rage", value: "100" });
    expect(summary[summary.length - 1]).toMatchObject({ label: "Run speed", value: "108%" });
    expect(summary[2]).toMatchObject({ label: "Armor", value: "900", bonus: "+780" });
  });
});

describe("stats tab", () => {
  it("starts casters on Spell, hunters on Ranged and everyone else on Melee", () => {
    expect(defaultStatsTab("Mage")).toBe("spell");
    expect(defaultStatsTab("Hunter")).toBe("ranged");
    expect(defaultStatsTab("Paladin")).toBe("melee");
    expect(defaultStatsTab("Monk")).toBe("melee");
  });

  it("reads back only a known tab", () => {
    expect(parseStatsTab("defenses")).toBe("defenses");
    expect(parseStatsTab("bogus")).toBeNull();
  });
});
