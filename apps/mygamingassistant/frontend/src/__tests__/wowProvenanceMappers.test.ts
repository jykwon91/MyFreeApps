import { describe, expect, it } from "vitest";
import { confidenceProvenance } from "@/games/wow-forever/lib/provenance/confidenceProvenance";
import { gearSourceProvenance } from "@/games/wow-forever/lib/provenance/gearSourceProvenance";
import { goldProvenance } from "@/games/wow-forever/lib/provenance/goldProvenance";
import { itemSectionProvenance } from "@/games/wow-forever/lib/provenance/itemSectionProvenance";
import { poiProvenance } from "@/games/wow-forever/lib/provenance/poiProvenance";
import { ITEM_SOURCE_SECTION } from "@/games/wow-forever/lib/itemPages/itemSourceSections";
import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { GOLD_CONFIDENCE } from "@/games/wow-forever/data/gold/goldTypes";
import { CONFIDENCE_BASIS } from "@/games/wow-forever/types/confidenceBasis";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import { POI_SOURCE } from "@/games/wow-forever/types/worldMap";

describe("confidenceProvenance", () => {
  it("a confirmed row has no badge, whatever its basis", () => {
    expect(confidenceProvenance("confirmed")).toBeNull();
    expect(confidenceProvenance("confirmed", CONFIDENCE_BASIS.classic)).toBeNull();
  });

  it("an unconfirmed row with no basis is Unconfirmed", () => {
    expect(confidenceProvenance("unconfirmed")).toEqual({ provenance: PROVENANCE.unconfirmed });
  });

  it("a beta report is Unconfirmed with the beta detail", () => {
    expect(confidenceProvenance("unconfirmed", CONFIDENCE_BASIS.beta)).toEqual({
      provenance: PROVENANCE.unconfirmed,
      detail: PROVENANCE_DETAIL.betaReport,
    });
  });

  it("a Classic route or rule is Classic data, saying which", () => {
    expect(confidenceProvenance("unconfirmed", CONFIDENCE_BASIS.classic)).toEqual({
      provenance: PROVENANCE.classic,
      detail: PROVENANCE_DETAIL.classicRoute,
    });
    expect(confidenceProvenance("unconfirmed", CONFIDENCE_BASIS.classicRule)).toEqual({
      provenance: PROVENANCE.classic,
      detail: PROVENANCE_DETAIL.classicRule,
    });
  });
});

describe("goldProvenance", () => {
  it("maps every gold confidence", () => {
    expect(goldProvenance(GOLD_CONFIDENCE.classic)).toBe(PROVENANCE.classic);
    expect(goldProvenance(GOLD_CONFIDENCE.forever)).toBe(PROVENANCE.published);
    expect(goldProvenance(GOLD_CONFIDENCE.unknown)).toBe(PROVENANCE.unconfirmed);
  });
});

describe("gearSourceProvenance", () => {
  it("crafted is game files, quests and drops are Classic, unknown has none", () => {
    expect(gearSourceProvenance("crafted")).toBe(PROVENANCE.client);
    expect(gearSourceProvenance("quest")).toBe(PROVENANCE.classic);
    expect(gearSourceProvenance("drop")).toBe(PROVENANCE.classic);
    expect(gearSourceProvenance("unknown")).toBeNull();
  });
});

describe("itemSectionProvenance", () => {
  it("only the crafted section is game files", () => {
    for (const section of Object.values(ITEM_SOURCE_SECTION)) {
      const expected = section === ITEM_SOURCE_SECTION.crafted ? PROVENANCE.client : PROVENANCE.classic;
      expect(itemSectionProvenance(section)).toBe(expected);
    }
  });
});

describe("poiProvenance", () => {
  it("a Classic location is Classic data", () => {
    expect(poiProvenance({ source: POI_SOURCE.classic })).toEqual({ provenance: PROVENANCE.classic });
  });

  it("a captured location is Seen in game with its date", () => {
    const capturedAt = "2026-11-05T12:00:00Z";
    expect(poiProvenance({ source: POI_SOURCE.captured, capturedAt })).toEqual({
      provenance: PROVENANCE.seen,
      date: new Date(capturedAt).toLocaleDateString(),
    });
  });

  it("a capture with no date is still Seen in game", () => {
    expect(poiProvenance({ source: POI_SOURCE.captured })).toEqual({ provenance: PROVENANCE.seen, date: undefined });
  });
});
