import { describe, expect, it } from "vitest";
import { parseTooltipText } from "@/games/wow-forever/parsing/parseTooltipText";

describe("parseTooltipText", () => {
  it("reads a Classic weapon tooltip", () => {
    const p = parseTooltipText(
      [
        "Thunderfury, Blessed Blade of the Windseeker",
        "Binds when picked up",
        "One-Hand\tSword",
        "44 - 115 Damage\tSpeed 1.90",
        "+16 - 30 Nature Damage",
        "(41.8 damage per second)",
        "+5 Agility",
        "+8 Stamina",
        "+8 Fire Resistance",
        "+9 Nature Resistance",
        "Chance on hit: Blasts your enemy with lightning.",
        "Requires Level 60",
      ].join("\n"),
    );
    expect(p.name).toBe("Thunderfury, Blessed Blade of the Windseeker");
    expect(p.slot).toBe("one_hand");
    expect(p.itemType).toBe("Sword");
    expect(p.weapon).toEqual({ minDamage: 44, maxDamage: 115, speed: 1.9 });
    expect(p.stats).toEqual({ agility: 5, stamina: 8, fire_resistance: 8, nature_resistance: 9 });
    expect(p.requiredLevel).toBe(60);
    expect(p.unparsedEffects).toEqual([
      "+16 - 30 Nature Damage",
      "Chance on hit: Blasts your enemy with lightning.",
    ]);
    expect(p.warnings).toEqual([]);
  });

  it("reads Classic Equip: lines, armor and set name", () => {
    const p = parseTooltipText(
      [
        "Netherwind Crown",
        "Head\tCloth",
        "84 Armor",
        "+26 Intellect",
        "Equip: Increases damage and healing done by magical spells and effects by up to 30.",
        "Equip: Improves your chance to get a critical strike with spells by 1%.",
        "Equip: Improves your chance to hit with spells by 1%.",
        "Equip: Restores 4 mana per 5 sec.",
        "Netherwind Regalia (0/8)",
      ].join("\n"),
    );
    expect(p.slot).toBe("head");
    expect(p.armor).toBe(84);
    expect(p.setName).toBe("Netherwind Regalia");
    expect(p.stats).toEqual({ intellect: 26, spell_power: 30, spell_crit_pct: 1, spell_hit_pct: 1, mp5: 4 });
  });

  it("keeps rated stats and expertise distinct from percent stats", () => {
    const p = parseTooltipText(
      [
        "Forever Blade",
        "Main Hand\tSword",
        "+12 Hit Rating",
        "Equip: Improves hit rating by 8.",
        "+10 Expertise Rating",
        "Equip: Increases your expertise by 3.",
        "Equip: Improves your chance to hit by 1%.",
      ].join("\n"),
    );
    expect(p.stats).toEqual({ hit_rating: 20, expertise_rating: 10, expertise: 3, hit_pct: 1 });
  });

  it("reads melee and ranged attack power separately", () => {
    const p = parseTooltipText(["Quiver", "Equip: +20 ranged Attack Power.", "Equip: +30 Attack Power."].join("\n"));
    expect(p.stats).toEqual({ ranged_attack_power: 20, attack_power: 30 });
  });

  it("warns instead of guessing", () => {
    expect(parseTooltipText("Mystery Item\nSoulbound").warnings[0]).toMatch(/no stats were found/i);
    const noSpeed = parseTooltipText("Club\nMain Hand\tMace\n10 - 20 Damage");
    expect(noSpeed.weapon).toBeNull();
    expect(noSpeed.warnings[0]).toMatch(/no speed/);
    expect(parseTooltipText("   ").warnings[0]).toMatch(/item name/);
  });
});
