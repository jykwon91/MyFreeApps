import { describe, expect, it } from "vitest";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { HOVER_CAST_MACROS } from "@/games/wow-forever/data/macros/hoverCastMacros";
import { MACRO_KIND_LABELS, MACRO_KIND_ORDER } from "@/games/wow-forever/data/macros/macroKinds";
import { MACRO_MAX_LENGTH } from "@/games/wow-forever/data/macros/macroMaxLength";
import { MACRO_NAMES } from "@/games/wow-forever/data/macros/macroNames";
import { SYNTAX_NOTES } from "@/games/wow-forever/data/macros/macroSyntaxNotes";
import { MOUSEOVER_TEMPLATES, SPELL_NAME_MAX_LENGTH, SPELL_PLACEHOLDER } from "@/games/wow-forever/data/macros/macroTemplates";
import { WARLOCK_MACROS } from "@/games/wow-forever/data/macros/warlockMacros";
import { ALL_MACROS, hoverCastToMacro, macroClasses, macroClassGroups } from "@/games/wow-forever/lib/macros/macroCatalog";
import { missingNames, namesInText } from "@/games/wow-forever/lib/macros/macroNameCheck";
import { fillMacroTemplate, findMacroTemplate } from "@/games/wow-forever/lib/macros/macroTemplates";
import type { Macro } from "@/games/wow-forever/types/macros/macro";
import type { MacroNames } from "@/games/wow-forever/types/macros/macroNames";

const CLASS_IDS = new Set(WOW_CLASSES.map((c) => c.id));
const LONGEST_SPELL = "X".repeat(SPELL_NAME_MAX_LENGTH);
const byId = (macros: readonly Macro[]) => macros.map((m) => [m.id, m] as const);

describe("hover-cast templates", () => {
  it.each(MOUSEOVER_TEMPLATES)("$title starts with #showtooltip and fits 255 characters with the longest spell", (template) => {
    const text = fillMacroTemplate(template, LONGEST_SPELL);
    expect(text.startsWith("#showtooltip\n/cast [@mouseover,")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(MACRO_MAX_LENGTH);
  });

  it("puts the player's spell in, trimmed", () => {
    expect(fillMacroTemplate(findMacroTemplate("friendly"), "  Flash Heal ")).toBe(
      "#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal",
    );
    expect(fillMacroTemplate(findMacroTemplate("enemy"), "Heal(Rank 1)")).toBe("#showtooltip\n/cast [@mouseover,harm,nodead][] Heal(Rank 1)");
    expect(fillMacroTemplate(findMacroTemplate("mouseover-only"), "Renew")).toBe("#showtooltip\n/cast [@mouseover,exists,nodead] Renew");
  });

  it("shows the placeholder while the spell is empty or blank", () => {
    for (const template of MOUSEOVER_TEMPLATES) {
      expect(fillMacroTemplate(template, "")).toBe(`#showtooltip\n/cast ${template.conditions} ${SPELL_PLACEHOLDER}`);
      expect(fillMacroTemplate(template, "   ")).toContain(SPELL_PLACEHOLDER);
    }
  });

  it("has unique ids", () => {
    expect(new Set(MOUSEOVER_TEMPLATES.map((t) => t.id)).size).toBe(MOUSEOVER_TEMPLATES.length);
  });
});

describe("every ready-made macro against the Forever client", () => {
  it("has unique ids across every class", () => {
    expect(new Set(ALL_MACROS.map((m) => m.id)).size).toBe(ALL_MACROS.length);
    expect(new Set(HOVER_CAST_MACROS.map((m) => `${m.classId}:${m.spell}`)).size).toBe(HOVER_CAST_MACROS.length);
  });

  it.each(byId(ALL_MACROS))("%s: every spell and item exists in the client for its class", (_id, macro) => {
    expect(CLASS_IDS.has(macro.classId)).toBe(true);
    expect(missingNames(macro, MACRO_NAMES)).toEqual([]);
  });

  it.each(byId(ALL_MACROS))("%s: is at most 255 characters", (_id, macro) => {
    expect(MACRO_MAX_LENGTH).toBe(255);
    expect(macro.text.length).toBeLessThanOrEqual(MACRO_MAX_LENGTH);
  });

  it.each(byId(ALL_MACROS))("%s: lists exactly the names its text uses", (_id, macro) => {
    expect([...new Set(namesInText(macro.text))].sort()).toEqual([...macro.spells, ...macro.items].sort());
  });

  it.each(byId(ALL_MACROS))("%s: has a title, summary and text, and no spell rank", (_id, macro) => {
    expect(macro.title && macro.summary && macro.text).toBeTruthy();
    expect(macro.text).not.toMatch(/\(Rank \d+\)/i);
  });

  it("every hover-cast macro uses a mouseover condition, and every macro using one is hover cast", () => {
    for (const m of ALL_MACROS) {
      expect(m.text.includes("@mouseover")).toBe(m.kind === "hover");
    }
  });

  it("labels every kind of syntax it uses as unconfirmed", () => {
    for (const m of ALL_MACROS) {
      if (m.text.includes("@focus")) expect(m.unconfirmed).toContain("focus");
      if (m.text.includes("/castsequence")) expect(m.unconfirmed).toContain("castsequence");
      if (m.text.includes("/stopcasting")) expect(m.unconfirmed).toContain("stopcasting");
      if (m.text.includes("/cast !")) expect(m.unconfirmed).toContain("bang");
      if (m.text.includes("[mod:")) expect(m.unconfirmed).toContain("modifier");
      if (m.text.includes("[nopet]")) expect(m.unconfirmed).toContain("nopet");
      if (m.text.includes("%t")) expect(m.unconfirmed).toContain("chatTarget");
      for (const syntax of m.unconfirmed) expect(SYNTAX_NOTES[syntax]).toBeTruthy();
    }
  });

  it("never uses Curse of Agony, which Forever renamed to Bane of Agony", () => {
    expect(ALL_MACROS.some((m) => m.text.includes("Curse of Agony"))).toBe(false);
  });

  it("has macros for every class", () => {
    expect(macroClasses().map((c) => c.id)).toEqual(WOW_CLASSES.map((c) => c.id));
  });
});

describe("the Warlock macros", () => {
  it("keeps every Warlock macro from the old Warlock page", () => {
    const text = ALL_MACROS.filter((m) => m.classId === "warlock").map((m) => m.text).join("\n");
    for (const needle of [
      "/petattack\n/cast !Shoot", "[mod:shift] Curse of Weakness", "[nopet] Summon Voidwalker", "/cast Fel Domination\n/cast Summon Voidwalker",
      "/petattack\n/cast Shadow Bolt", "/petattack [@mouseover,harm,nodead]", "/cast Seduction", "@focus,harm,nodead][] Seduction",
      "/cast Spell Lock", "@focus,harm,nodead][] Spell Lock", "/cast Suffering", "/cast Sacrifice", "/stopcasting\n/cast Fear",
      "/stopcasting\n/cast Death Coil", "[@mouseover,harm,nodead][] Corruption", "[@mouseover,harm,nodead][] Bane of Agony",
      "@mouseover,exists,nodead][] Devour Magic", "@focus,harm,nodead][] Fear", "@focus,harm,nodead][] Banish", "/use Major Healthstone",
      "/use Major Healing Potion", "/cast Create Healthstone", "/use Major Soulstone", "/p Soulstone on %t", "/p Summoning %t",
      "/cast Life Tap", "[@mouseover,harm,nodead][] Drain Soul", "/castsequence reset=target/combat Corruption, Bane of Agony, Immolate",
      "/cast Amplify Curse\n/cast Bane of Agony",
    ]) {
      expect(text).toContain(needle);
    }
    expect(WARLOCK_MACROS).toHaveLength(26);
  });
});

describe("macroClassGroups", () => {
  it("lists every class in class order, hover cast first within each", () => {
    const groups = macroClassGroups("all");
    expect(groups.map((g) => g.wowClass.id)).toEqual(WOW_CLASSES.map((c) => c.id));
    for (const g of groups) {
      expect(g.kinds[0]?.kind).toBe("hover");
      const order = g.kinds.map((k) => MACRO_KIND_ORDER.indexOf(k.kind));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      for (const k of g.kinds) expect(k.macros.length).toBeGreaterThan(0);
    }
    expect(MACRO_KIND_LABELS.hover).toBe("Hover cast");
  });

  it("keeps only the picked class", () => {
    const groups = macroClassGroups("warlock");
    expect(groups.map((g) => g.wowClass.id)).toEqual(["warlock"]);
    expect(groups[0]?.kinds.map((k) => k.kind)).toEqual(["hover", "damage", "pet", "focus", "emergency", "stones", "utility"]);
    expect(groups[0]?.kinds.flatMap((k) => k.macros)).toHaveLength(ALL_MACROS.filter((m) => m.classId === "warlock").length);
  });

  it("turns a template macro into a titled, checked hover-cast macro", () => {
    expect(hoverCastToMacro({ id: "x", classId: "priest", template: "friendly", spell: "Renew", summary: "s" })).toEqual({
      id: "x",
      classId: "priest",
      kind: "hover",
      title: "Renew (Priest)",
      summary: "s",
      text: "#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Renew",
      spells: ["Renew"],
      items: [],
      unconfirmed: [],
    });
  });
});

describe("missingNames", () => {
  const client: MacroNames = {
    source: "",
    clientBuild: "1",
    classes: { druid: [], hunter: [], mage: [], paladin: [], priest: ["Renew"], rogue: [], shaman: [], warlock: ["Fear", "Seduction"], warrior: [] },
    generalSpells: ["Shoot"],
    items: ["Healthstone", "Healing Potion"],
  };
  const macro = (classId: Macro["classId"], spells: string[], items: string[]): Macro => ({
    id: "x", classId, kind: "utility", title: "x", summary: "x", text: "x", spells, items, unconfirmed: [],
  });

  it("accepts the class's spells and pet abilities, general spells and items", () => {
    expect(missingNames(macro("warlock", ["Fear", "Seduction", "Shoot"], ["Healthstone", "Healing Potion"]), client)).toEqual([]);
  });

  it("checks a spell against the macro's own class only", () => {
    expect(missingNames(macro("priest", ["Fear"], []), client)).toEqual(["Fear"]);
    expect(missingNames(macro("warlock", ["Renew"], []), client)).toEqual(["Renew"]);
  });

  it("reports names the client lacks, and does not mix up spells with items", () => {
    expect(missingNames(macro("warlock", ["Curse of Agony", "Healthstone"], ["Fear"]), client)).toEqual([
      "Curse of Agony",
      "Healthstone",
      "Fear",
    ]);
  });
});

describe("namesInText", () => {
  it("reads /cast and /use names without conditions", () => {
    expect(namesInText("/stopcasting\n/cast [@focus,harm][] Fear\n/use Major Healthstone")).toEqual(["Fear", "Major Healthstone"]);
  });

  it("reads each ; clause of a /cast and drops the ! keep-on prefix", () => {
    expect(namesInText("/cast [mod:shift] Curse of Weakness; Bane of Agony\n/cast !Shoot")).toEqual([
      "Curse of Weakness",
      "Bane of Agony",
      "Shoot",
    ]);
  });

  it("splits a /castsequence and drops its reset option", () => {
    expect(namesInText("/castsequence reset=target/combat Corruption, Bane of Agony")).toEqual(["Corruption", "Bane of Agony"]);
  });

  it("ignores #showtooltip and other commands", () => {
    expect(namesInText("#showtooltip\n/petattack\n/startattack")).toEqual([]);
  });
});
