import { describe, expect, it } from "vitest";
import names from "@/games/wow-forever/data/warlock/warlockNames.json";
import { SYNTAX_NOTES } from "@/games/wow-forever/data/warlock/macroSyntaxNotes";
import { WARLOCK_MACROS } from "@/games/wow-forever/data/warlock/warlockMacros";
import { MACRO_MAX_LENGTH, missingNames, namesInText } from "@/games/wow-forever/lib/warlockMacros";
import type { WarlockMacro } from "@/games/wow-forever/types/warlockMacro";
import type { WarlockNames } from "@/games/wow-forever/types/warlockNames";

const CLIENT = names as WarlockNames;

describe("Warlock macros against the Forever client", () => {
  it.each(WARLOCK_MACROS.map((m) => [m.id, m] as const))("%s: every spell and item exists in the client", (_id, macro) => {
    expect(missingNames(macro, CLIENT)).toEqual([]);
  });

  it.each(WARLOCK_MACROS.map((m) => [m.id, m] as const))("%s: is at most 255 characters", (_id, macro) => {
    expect(MACRO_MAX_LENGTH).toBe(255);
    expect(macro.text.length).toBeLessThanOrEqual(MACRO_MAX_LENGTH);
  });

  it.each(WARLOCK_MACROS.map((m) => [m.id, m] as const))("%s: lists exactly the names its text uses", (_id, macro) => {
    expect([...new Set(namesInText(macro.text))].sort()).toEqual([...macro.spells, ...macro.items].sort());
  });

  it("has unique ids and non-empty text, title and summary", () => {
    expect(new Set(WARLOCK_MACROS.map((m) => m.id)).size).toBe(WARLOCK_MACROS.length);
    for (const m of WARLOCK_MACROS) {
      expect(m.title && m.summary && m.text).toBeTruthy();
    }
  });

  it("never names a spell with a rank, so the highest known rank is cast", () => {
    for (const m of WARLOCK_MACROS) expect(m.text).not.toMatch(/\(Rank \d+\)/i);
  });

  it("labels every kind of syntax it uses as unconfirmed", () => {
    const usesIn = (m: WarlockMacro, needle: string) => m.text.includes(needle);
    for (const m of WARLOCK_MACROS) {
      if (usesIn(m, "@focus")) expect(m.unconfirmed).toContain("focus");
      if (usesIn(m, "@mouseover")) expect(m.unconfirmed).toContain("mouseover");
      if (usesIn(m, "/castsequence")) expect(m.unconfirmed).toContain("castsequence");
      if (usesIn(m, "/stopcasting")) expect(m.unconfirmed).toContain("stopcasting");
      if (usesIn(m, "/cast !")) expect(m.unconfirmed).toContain("bang");
      if (usesIn(m, "[mod:")) expect(m.unconfirmed).toContain("modifier");
      if (usesIn(m, "[nopet]")) expect(m.unconfirmed).toContain("nopet");
      if (usesIn(m, "%t")) expect(m.unconfirmed).toContain("chatTarget");
      for (const syntax of m.unconfirmed) expect(SYNTAX_NOTES[syntax]).toBeTruthy();
    }
  });

  it("covers the requested groups", () => {
    const text = WARLOCK_MACROS.map((m) => m.text).join("\n");
    for (const needle of [
      "/petattack", "Seduction", "Spell Lock", "Suffering", "Sacrifice", "/stopcasting\n/cast Fear",
      "/stopcasting\n/cast Death Coil", "@mouseover,harm,nodead][] Corruption", "Bane of Agony", "@focus,harm,nodead][] Fear",
      "Banish", "Major Healthstone", "/cast !Shoot", "[mod:shift] Curse of Weakness", "[nopet] Summon Voidwalker",
      "/p Summoning %t", "/p Soulstone on %t", "Major Healing Potion", "Fel Domination", "@focus,harm,nodead][] Spell Lock",
      "/petattack [@mouseover,harm,nodead]", "@focus,harm,nodead][] Seduction", "@mouseover,exists,nodead][] Devour Magic", "Create Healthstone", "Soulstone", "Life Tap", "Drain Soul", "Amplify Curse",
    ]) {
      expect(text).toContain(needle);
    }
  });
});

describe("missingNames", () => {
  const client: WarlockNames = {
    source: "", clientBuild: "1", spells: ["Fear"], petSpells: ["Seduction"], generalSpells: ["Shoot"], items: ["Healthstone"], potions: ["Healing Potion"],
  };
  const macro = (spells: string[], items: string[]): WarlockMacro => ({
    id: "x", title: "x", summary: "x", text: "x", spells, items, unconfirmed: [],
  });

  it("accepts spells, pet abilities, general spells, items and potions the client has", () => {
    expect(missingNames(macro(["Fear", "Seduction", "Shoot"], ["Healthstone", "Healing Potion"]), client)).toEqual([]);
  });

  it("reports names the client lacks, and does not mix up spells with items", () => {
    expect(missingNames(macro(["Curse of Agony", "Healthstone"], ["Fear"]), client)).toEqual([
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

  it("ignores other commands", () => {
    expect(namesInText("/petattack\n/startattack")).toEqual([]);
  });
});
