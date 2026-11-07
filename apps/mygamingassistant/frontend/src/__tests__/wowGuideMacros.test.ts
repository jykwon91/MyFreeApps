import { describe, expect, it } from "vitest";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { CLASS_MACROS, MORE_CLASS_MACROS } from "@/games/wow-forever/data/guide/classMacros";
import classSpellNamesJson from "@/games/wow-forever/data/guide/classSpellNames.json";
import { MOUSEOVER_TEMPLATES, SPELL_NAME_MAX_LENGTH, SPELL_PLACEHOLDER } from "@/games/wow-forever/data/guide/macroTemplates";
import { MACRO_MAX_LENGTH } from "@/games/wow-forever/data/macroMaxLength";
import { classMacroGroups, classMacroText } from "@/games/wow-forever/lib/classMacros";
import { fillMacroTemplate, findMacroTemplate } from "@/games/wow-forever/lib/macroTemplates";
import type { ClassSpellNames } from "@/games/wow-forever/types/classSpellNames";

const CLASS_SPELLS = classSpellNamesJson as ClassSpellNames;
const CLASS_IDS = new Set(WOW_CLASSES.map((c) => c.id));
const LONGEST_SPELL = "X".repeat(SPELL_NAME_MAX_LENGTH);

describe("mouseover macro templates", () => {
  it.each(MOUSEOVER_TEMPLATES)("$title starts with #showtooltip and fits 255 characters with the longest spell", (template) => {
    const text = fillMacroTemplate(template, LONGEST_SPELL);
    expect(text.startsWith("#showtooltip\n/cast [@mouseover,")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(MACRO_MAX_LENGTH);
  });

  it("puts the player's spell in, trimmed", () => {
    expect(fillMacroTemplate(findMacroTemplate("friendly"), "  Flash Heal ")).toBe(
      "#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal",
    );
    expect(fillMacroTemplate(findMacroTemplate("enemy"), "Heal(Rank 1)")).toBe(
      "#showtooltip\n/cast [@mouseover,harm,nodead][] Heal(Rank 1)",
    );
    expect(fillMacroTemplate(findMacroTemplate("mouseover-only"), "Renew")).toBe(
      "#showtooltip\n/cast [@mouseover,exists,nodead] Renew",
    );
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

describe("ready-made class macros", () => {
  it("has unique ids and no class/spell twice", () => {
    expect(new Set(CLASS_MACROS.map((m) => m.id)).size).toBe(CLASS_MACROS.length);
    expect(new Set(CLASS_MACROS.map((m) => `${m.classId}:${m.spell}`)).size).toBe(CLASS_MACROS.length);
  });

  it.each(CLASS_MACROS)("$id is a valid class, starts with #showtooltip and fits 255 characters", (macro) => {
    expect(CLASS_IDS.has(macro.classId)).toBe(true);
    const text = classMacroText(macro);
    expect(text.startsWith("#showtooltip\n")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(MACRO_MAX_LENGTH);
    expect(text.endsWith(` ${macro.spell}`)).toBe(true);
  });

  it.each(CLASS_MACROS)("$id casts a spell its class has in the Forever client", (macro) => {
    expect(CLASS_SPELLS.classes[macro.classId]).toContain(macro.spell);
  });

  it("covers every class mouseover helps, and leaves Rogues and Warriors out", () => {
    const covered = classMacroGroups().map((g) => g.wowClass.id);
    expect(covered).toEqual(["druid", "hunter", "mage", "paladin", "priest", "shaman", "warlock"]);
  });

  it("never uses Curse of Agony, which Forever renamed to Bane of Agony", () => {
    expect(CLASS_MACROS.some((m) => m.spell === "Curse of Agony")).toBe(false);
  });

  it("links only to routes the app has", () => {
    for (const link of Object.values(MORE_CLASS_MACROS)) {
      expect(link?.to).toMatch(/^\/wow-forever\//);
    }
  });
});
