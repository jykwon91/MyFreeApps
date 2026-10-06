import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOODS, TRAINER_SKILLS } from "@/games/wow-forever/data/food/foodData";
import { buffValue, foodWeights, partValue } from "@/games/wow-forever/food/foodScore";
import { describeBuff, learnLabel } from "@/games/wow-forever/food/foodText";
import { BETA_LEVEL_CAP, levelCap } from "@/games/wow-forever/data/levelCap";
import { cookingCapAt, rankFoods, type FoodPickerInput } from "@/games/wow-forever/food/rankFoods";
import { DEFAULT_FOOD_SETTINGS, parseFoodSettings } from "@/games/wow-forever/hooks/useFoodPickerSettings";
import type { FoodBuffPart, FoodRecord } from "@/games/wow-forever/types/food";

function food(name: string): FoodRecord {
  const found = FOODS.find((f) => f.name === name);
  if (!found) throw new Error(`no food ${name}`);
  return found;
}

function rank(input: Partial<FoodPickerInput>) {
  return rankFoods(
    FOODS,
    { level: 35, levelCap: 60, classId: "warrior", specId: "leveling", activity: "leveling", cookingSkill: null, ...input },
    TRAINER_SKILLS,
  );
}

/** These tests pick levels past the beta cap: run them after launch. */
const AFTER_LAUNCH = new Date("2026-11-05T12:00:00Z");
const IN_BETA = new Date("2026-10-05T12:00:00Z");

function at(date: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(date);
}

const AP: FoodBuffPart = { amount: 10, percent: false, label: "Attack Power", stats: ["attack_power", "ranged_attack_power"] };
const HEALING: FoodBuffPart = { amount: 10, percent: false, label: "Healing Power", stats: ["healing"] };
const SPELL: FoodBuffPart = { amount: 10, percent: false, label: "Spell Damage", stats: ["spell_damage"] };
const CRIT: FoodBuffPart = { amount: 1, percent: true, label: "Critical Strike chance", stats: ["crit_pct", "spell_crit_pct"] };

describe("food data", () => {
  it("has the client's Monster Omelet", () => {
    const omelet = food("Monster Omelet");
    expect(omelet.level).toBe(35);
    expect(omelet.heal).toEqual({ amount: 1392, seconds: 30 });
    expect(describeBuff(omelet.buff!)).toBe("+15 Stamina");
  });

  it("words zone-limited and multi-stat buffs as the tooltip does", () => {
    expect(describeBuff(food("Westfall Stew").buff!)).toBe("+15% movement speed in Westfall");
    expect(describeBuff(food("Prowler Steak").buff!)).toBe("+25 Strength, +10 Stamina");
  });
});

describe("buff value", () => {
  it("counts attack power once — the better of melee and ranged", () => {
    const hunter = foodWeights("hunter", "leveling", "leveling");
    // Hunter leveling: ranged AP 0.5, melee AP 0.4.
    expect(partValue(AP, hunter)).toBeCloseTo(5);
  });

  it("gives healing power nothing unless you heal", () => {
    expect(partValue(HEALING, foodWeights("warrior", "fury", "dungeon"))).toBe(0);
    expect(partValue(HEALING, foodWeights("priest", "holy", "dungeon"))).toBeGreaterThan(0);
  });

  it("doesn't let a healer's spell power count for spell damage", () => {
    expect(partValue(SPELL, foodWeights("paladin", "holy", "raid"))).toBe(0);
    expect(partValue(SPELL, foodWeights("mage", "fire", "raid"))).toBeGreaterThan(0);
  });

  it("values all-crit once for a spec that only weights spell crit", () => {
    const fire = foodWeights("mage", "fire", "raid");
    expect(partValue(CRIT, fire)).toBeCloseTo(fire.weights.stats.spell_crit_pct ?? 0);
  });

  it("raises Stamina to your main stat's worth in PvP", () => {
    const stam = food("Monster Omelet").buff;
    const dungeon = buffValue(stam, foodWeights("rogue", "combat", "dungeon"));
    const pvp = buffValue(stam, foodWeights("rogue", "combat", "pvp"));
    expect(pvp).toBeGreaterThan(dungeon);
  });

  it("uses Pawn spec weights outside leveling, the leveling rule of thumb while leveling", () => {
    expect(foodWeights("warrior", "fury", "raid").label).toBe("Pawn's Classic Era weights for Fury Warrior");
    expect(foodWeights("warrior", "fury", "leveling").label).toBe("the Warrior leveling rule of thumb");
    expect(foodWeights("warrior", "leveling", "raid").label).toBe("the Warrior leveling rule of thumb");
  });
});

describe("rankFoods", () => {
  it("picks the best stats a level 35 Warrior can eat while leveling", () => {
    const result = rank({});
    expect(result.top?.food.name).toBe("Poached Sunscale Salmon");
    for (const f of [result.top!, ...result.runnersUp]) expect(f.food.level).toBeLessThanOrEqual(35);
  });

  it("names the first level where something better unlocks", () => {
    const result = rank({});
    expect(result.nextUpgrade?.level).toBe(55);
    expect(result.nextUpgrade?.pick.food.name).toBe("Prowler Steak");
  });

  it("never offers a caster attack power food", () => {
    const result = rank({ classId: "mage" });
    const all = [result.top!, ...result.runnersUp];
    expect(all.some((p) => p.food.buff?.parts.some((part) => part.label === "Attack Power"))).toBe(false);
  });

  it("picks healing food for a Holy Priest in a dungeon", () => {
    expect(rank({ classId: "priest", specId: "holy", activity: "dungeon", level: 45 }).top?.food.name).toBe("Sage's Tea");
    expect(rank({ classId: "priest", specId: "holy", activity: "dungeon", level: 60 }).top?.food.name).toBe("Sunrise Omelette");
  });

  it("offers feasts only for groups", () => {
    const names = (r: ReturnType<typeof rank>) => [r.top, ...r.runnersUp].map((p) => p?.food.name);
    expect(names(rank({ classId: "priest", specId: "holy", activity: "raid", level: 60 }))).toContain("Grand Lobster Banquet");
    expect(names(rank({ classId: "priest", specId: "holy", activity: "pvp", level: 60 }))).not.toContain("Grand Lobster Banquet");
  });

  it("folds foods with the same effect into one row", () => {
    const result = rank({ level: 60 });
    const rows = [result.top!, ...result.runnersUp];
    const keys = rows.map((p) => JSON.stringify(p.food.buff));
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.some((p) => p.sameAs.length > 0)).toBe(true);
  });

  it("ranks Fishing by Fishing skill", () => {
    expect(rank({ activity: "fishing" }).top?.food.name).toBe("Filet of Redgill");
  });

  it("ranks Just healing by the most health", () => {
    const result = rank({ activity: "healing", level: 5 });
    expect(result.top?.food.name).toBe("Longjaw Mud Snapper");
    expect(result.top?.food.heal?.amount).toBe(552);
  });

  it("splits by Cooking skill: the top pick is cookable, the better one is worth training for", () => {
    const result = rank({ cookingSkill: 100 });
    const top = result.top!;
    expect(top.skillNeeded === null || top.skillNeeded <= 100).toBe(true);
    expect(result.trainFor?.food.name).toBe("Poached Sunscale Salmon");
    expect(learnLabel(result.trainFor!)).toBe("Needs a recipe · Cooking 250");
  });

  it("promises no upgrade past the level cap", () => {
    // At the beta cap of 30, the level-35 Spotted Yellowtail is out of reach.
    const result = rank({ level: 30, levelCap: 30, classId: "warlock", cookingSkill: 175 });
    expect(result.nextUpgrade).toBeNull();
    expect(rank({ level: 30, levelCap: 60, classId: "warlock" }).nextUpgrade?.level).toBe(35);
  });

  it("only says a recipe is worth training for when the level can train that far", () => {
    // Cooking past 225 needs Artisan, which needs level 35.
    const result = rank({ level: 30, levelCap: 30, classId: "warlock", cookingSkill: 175 });
    expect(result.trainFor?.skillNeeded ?? 0).toBeLessThanOrEqual(225);
    expect([cookingCapAt(9), cookingCapAt(10), cookingCapAt(20), cookingCapAt(34), cookingCapAt(35)]).toEqual([75, 150, 225, 225, 300]);
  });

  it("returns nothing for a level with nothing that helps", () => {
    const result = rank({ activity: "fishing", level: 1 });
    expect(result.top).toBeNull();
    expect(result.nextUpgrade?.level).toBe(5);
  });
});

describe("level cap", () => {
  afterEach(() => vi.useRealTimers());

  it("is 30 in the beta and 60 from launch day", () => {
    expect(levelCap(IN_BETA.getTime())).toBe(BETA_LEVEL_CAP);
    expect(levelCap(Date.UTC(2026, 10, 3, 23, 59))).toBe(30);
    expect(levelCap(Date.UTC(2026, 10, 4))).toBe(60);
  });

  it("reads a level past the cap as the cap", () => {
    at(IN_BETA);
    expect(parseFoodSettings({ level: "45" }, DEFAULT_FOOD_SETTINGS).level).toBe(30);
    at(AFTER_LAUNCH);
    expect(parseFoodSettings({ level: "45" }, DEFAULT_FOOD_SETTINGS).level).toBe(45);
  });
});

describe("parseFoodSettings", () => {
  beforeEach(() => at(AFTER_LAUNCH));
  afterEach(() => vi.useRealTimers());

  it("reads URL values and ignores bad ones field by field", () => {
    const s = parseFoodSettings({ level: "35", classId: "rogue", specId: "combat", activity: "pvp", cookingSkill: "abc" }, DEFAULT_FOOD_SETTINGS);
    expect(s).toEqual({ level: 35, classId: "rogue", specId: "combat", activity: "pvp", cookingSkill: null });
  });

  it("drops a spec that isn't the class's", () => {
    expect(parseFoodSettings({ classId: "mage", specId: "fury" }, DEFAULT_FOOD_SETTINGS).specId).toBe("leveling");
  });

  it("keeps the fallback for fields the URL doesn't set", () => {
    const fallback = { ...DEFAULT_FOOD_SETTINGS, level: 20, activity: "raid" as const };
    expect(parseFoodSettings({}, fallback)).toEqual(fallback);
    expect(parseFoodSettings({ level: "99" }, fallback).level).toBeNull();
  });
});
