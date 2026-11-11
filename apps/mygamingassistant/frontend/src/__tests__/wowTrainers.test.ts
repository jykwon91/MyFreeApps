import { describe, expect, it } from "vitest";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import warlockClassic from "@/games/wow-forever/data/spellbook/classic/warlock.json";
import warlockFile from "@/games/wow-forever/data/spellbook/warlock.json";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { PROFESSION_GROUPS } from "@/games/wow-forever/data/professions/professionPicker";
import { findTrainerSubject, TRAINER_SUBJECT_GROUPS } from "@/games/wow-forever/data/trainers/trainerSubjects";
import { PROFESSION_SERVICE_TAG } from "@/games/wow-forever/data/trainers/trainersConfig";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { decodeSpellbook } from "@/games/wow-forever/lib/spellbook/decodeSpellbook";
import { levelUnlocks, splitAtLevel } from "@/games/wow-forever/lib/trainers/levelUnlocks";
import { professionRankSteps } from "@/games/wow-forever/lib/trainers/professionRankSteps";
import { rankFacts } from "@/games/wow-forever/lib/trainers/rankFacts";
import { serviceTrainers } from "@/games/wow-forever/lib/trainers/serviceTrainers";
import type { SpellbookClassicFile } from "@/games/wow-forever/types/spellbook/spellbookClassicFile";
import type { SpellbookFile } from "@/games/wow-forever/types/spellbook/spellbookFile";
import type { TrainerServiceRow } from "@/games/wow-forever/types/trainers/trainerServiceRow";
import type { TrainerServices } from "@/games/wow-forever/types/trainers/trainerServices";

const SERVICES = {
  rows: servicesJson.rows as unknown as readonly TrainerServiceRow[],
  zones: zonesJson.zones,
} as TrainerServices;
const WARLOCK = decodeSpellbook(warlockFile as unknown as SpellbookFile, warlockClassic as unknown as SpellbookClassicFile);
const LADDER = levelUnlocks(WARLOCK);

describe("trainers picker", () => {
  it("lists all nine classes, then every profession the Professions page has", () => {
    expect(TRAINER_SUBJECT_GROUPS.map((g) => g.label)).toEqual(["Classes", ...PROFESSION_GROUPS.map((g) => g.label)]);
    expect(TRAINER_SUBJECT_GROUPS[0].subjects.map((s) => s.id)).toEqual(WOW_CLASSES.map((c) => c.id));
    expect(findTrainerSubject("mage")).toEqual({ kind: "class", id: "mage", label: "Mage" });
    expect(findTrainerSubject("firstaid")).toMatchObject({ kind: "profession", id: "firstaid" });
    expect(findTrainerSubject("nope")).toBeUndefined();
  });

  it("every class has trainers for some faction, and every profession for both", () => {
    for (const c of WOW_CLASSES) {
      const total =
        serviceTrainers(SERVICES, SERVICE_KIND.classTrainer, c.id, "A").length + serviceTrainers(SERVICES, SERVICE_KIND.classTrainer, c.id, "H").length;
      expect(total, c.id).toBeGreaterThan(0);
    }
    for (const [profession, tag] of Object.entries(PROFESSION_SERVICE_TAG)) {
      expect(serviceTrainers(SERVICES, SERVICE_KIND.professionTrainer, tag, "A").length, profession).toBeGreaterThan(0);
      expect(serviceTrainers(SERVICES, SERVICE_KIND.professionTrainer, tag, "H").length, profession).toBeGreaterThan(0);
    }
  });
});

describe("serviceTrainers", () => {
  it("keeps your faction and neutral NPCs, capitals first", () => {
    const mages = serviceTrainers(SERVICES, SERVICE_KIND.classTrainer, "mage", "A");
    const firstTown = mages.findIndex((t) => !t.city);
    expect(firstTown).toBeGreaterThan(0);
    expect(mages.slice(firstTown).every((t) => !t.city)).toBe(true);
    expect(mages.map((t) => t.name)).toEqual(expect.arrayContaining(["Elsharin"]));
    const hordeMages = serviceTrainers(SERVICES, SERVICE_KIND.classTrainer, "mage", "H").map((t) => t.name);
    expect(hordeMages).not.toContain("Elsharin");
  });

  it("names a town trainer's area as 'subzone, zone'", () => {
    const warlocks = serviceTrainers(SERVICES, SERVICE_KIND.classTrainer, "warlock", "H");
    expect(warlocks.find((t) => t.name === "Dhugru Gorelust")?.where).toBe("Razor Hill, Durotar");
  });

  it("has no Horde Paladin or Alliance Shaman trainer: Forever added those and the Classic data predates them", () => {
    expect(serviceTrainers(SERVICES, SERVICE_KIND.classTrainer, "paladin", "H")).toEqual([]);
    expect(serviceTrainers(SERVICES, SERVICE_KIND.classTrainer, "shaman", "A")).toEqual([]);
  });

  it("lists demon trainers with no class tag", () => {
    expect(serviceTrainers(SERVICES, SERVICE_KIND.demonTrainer, null, "H").map((t) => t.name)).toContain("Kurgul");
  });
});

describe("levelUnlocks", () => {
  it("lists only levels with something to learn, lowest first, each level once", () => {
    const levels = LADDER.map((l) => l.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
    expect(LADDER.every((l) => l.unlocks.length > 0)).toBe(true);
    const six = LADDER.find((l) => l.level === 6);
    expect(six?.unlocks.map((u) => `${u.name} ${u.rank}`)).toEqual(expect.arrayContaining(["Life Tap Rank 1", "Shadow Bolt Rank 2"]));
  });

  it("leaves out talent-granted ranks", () => {
    const talentRanks = WARLOCK.spells.flatMap((s) => s.ranks).filter((r) => r.learnedBy === "talent").map((r) => r.spell);
    expect(talentRanks.length).toBeGreaterThan(0);
    const listed = new Set(LADDER.flatMap((l) => l.unlocks.map((u) => u.spell)));
    expect(talentRanks.some((s) => listed.has(s))).toBe(false);
  });

  it("splits at your level: below folds away, your level and up are ahead", () => {
    expect(splitAtLevel(LADDER, null)).toEqual({ passed: [], ahead: LADDER });
    const { passed, ahead } = splitAtLevel(LADDER, 6);
    expect(passed.map((l) => l.level)).toEqual([1, 4]);
    expect(ahead[0].level).toBe(6);
  });
});

describe("professionRankSteps", () => {
  it("crafting: Apprentice, then Journeyman / Expert / Artisan with skill, level and cap", () => {
    const steps = professionRankSteps("tailoring");
    expect(steps.map((s) => s.name)).toEqual(["Apprentice", "Journeyman", "Expert", "Artisan"]);
    expect(steps[0]).toMatchObject({ skill: "1", cap: 75 });
    expect(steps.map((s) => s.cap)).toEqual([75, 150, 225, 300]);
    expect(steps.slice(1).every((s) => s.craftingRank !== null)).toBe(true);
  });

  it("reads each rank as skill · level · cap, leaving out what it lacks", () => {
    const [apprentice, journeyman] = professionRankSteps("tailoring");
    expect(rankFacts(apprentice)).toBe("Skill 1 · cap 75");
    expect(rankFacts(journeyman)).toMatch(/^Skill \d+ · level \d+ · cap 150$/);
  });

  it("gathering ranks come from the gathering table", () => {
    expect(professionRankSteps("mining").map((s) => s.name)).toEqual(["Apprentice", "Journeyman", "Expert", "Artisan"]);
  });

  it("Cooking and Fishing use their guide's milestones", () => {
    for (const profession of ["cooking", "fishing"] as const) {
      const steps = professionRankSteps(profession);
      expect(steps[0].name, profession).toBe("Apprentice");
      expect(steps.length, profession).toBeGreaterThan(3);
      expect(steps.slice(1).every((s) => s.milestone !== null), profession).toBe(true);
    }
  });
});
