import { describe, expect, it } from "vitest";
import type { Lineup } from "@/types/game";
import { compareZones } from "@/lib/lineup/compareZones";
import { compareLineups } from "@/lib/lineup/compareLineups";
import { groupByZone } from "@/lib/lineup/groupByZone";
import { buildEmptyMessage } from "@/lib/lineup/buildEmptyMessage";

interface Spec {
  id: string;
  zone?: string | null;
  zoneSlug?: string;
  util?: string | null;
  side?: string | null;
}

function lineup(spec: Spec): Lineup {
  return {
    id: spec.id,
    side: spec.side === undefined ? "any" : spec.side,
    target_zone:
      spec.zone === null
        ? null
        : { name: spec.zone ?? "Mid", slug: spec.zoneSlug ?? "mid" },
    utility_type: spec.util ? { slug: spec.util } : null,
  } as unknown as Lineup;
}

const ids = (ls: Lineup[]): string[] => ls.map((l) => l.id);

describe("compareZones", () => {
  it("orders A Site, B Site, Mid, then others alphabetically", () => {
    const sorted = ["Window", "Mid", "B Site", "Apps", "A Site"].sort(compareZones);
    expect(sorted).toEqual(["A Site", "B Site", "Mid", "Apps", "Window"]);
  });

  it("accepts hyphen and underscore prefixes, case-insensitively", () => {
    expect(compareZones("a-site long", "B_SITE")).toBeLessThan(0);
    expect(compareZones("Mid Doors", "b site")).toBeGreaterThan(0);
  });

  it("returns 0 for identical names", () => {
    expect(compareZones("Apps", "Apps")).toBe(0);
  });
});

describe("compareLineups", () => {
  it("orders by utility sortOrder first", () => {
    const smoke = lineup({ id: "s", util: "smoke", side: "side_b" });
    const flash = lineup({ id: "f", util: "flash", side: "side_a" });
    expect(compareLineups(smoke, flash)).toBeLessThan(0);
    expect(compareLineups(flash, smoke)).toBeGreaterThan(0);
  });

  it("breaks utility ties by side: T, CT, any", () => {
    const t = lineup({ id: "t", util: "smoke", side: "side_a" });
    const ct = lineup({ id: "ct", util: "smoke", side: "side_b" });
    const both = lineup({ id: "b", util: "smoke", side: "any" });
    expect([both, ct, t].sort(compareLineups).map((l) => l.id)).toEqual(["t", "ct", "b"]);
  });

  it("treats null side as any and unknown side last", () => {
    const nul = lineup({ id: "n", util: "smoke", side: null });
    const any = lineup({ id: "a", util: "smoke", side: "any" });
    const odd = lineup({ id: "o", util: "smoke", side: "weird" });
    expect(compareLineups(nul, any)).toBe(0);
    expect(compareLineups(odd, any)).toBeGreaterThan(0);
  });

  it("sorts unknown or missing utility last", () => {
    const smoke = lineup({ id: "s", util: "smoke" });
    const none = lineup({ id: "x", util: null });
    expect(compareLineups(smoke, none)).toBeLessThan(0);
  });
});

describe("groupByZone", () => {
  it("returns an empty array for empty input", () => {
    expect(groupByZone([])).toEqual([]);
  });

  it("groups by zone name and orders the zones", () => {
    const groups = groupByZone([
      lineup({ id: "1", zone: "Window", zoneSlug: "window" }),
      lineup({ id: "2", zone: "B Site", zoneSlug: "b-site" }),
      lineup({ id: "3", zone: "A Site", zoneSlug: "a-site" }),
      lineup({ id: "4", zone: "B Site", zoneSlug: "b-site" }),
    ]);
    expect(groups.map((g) => g.zoneName)).toEqual(["A Site", "B Site", "Window"]);
    expect(groups.map((g) => g.zoneSlug)).toEqual(["a-site", "b-site", "window"]);
    expect(ids(groups[1].lineups).sort()).toEqual(["2", "4"]);
  });

  it("sorts lineups within a group by utility then side", () => {
    const [group] = groupByZone([
      lineup({ id: "flash-t", util: "flash", side: "side_a" }),
      lineup({ id: "smoke-any", util: "smoke", side: "any" }),
      lineup({ id: "smoke-t", util: "smoke", side: "side_a" }),
    ]);
    expect(ids(group.lineups)).toEqual(["smoke-t", "smoke-any", "flash-t"]);
  });

  it("keeps input order for fully tied lineups", () => {
    const [group] = groupByZone([
      lineup({ id: "a", util: "smoke", side: "side_a" }),
      lineup({ id: "b", util: "smoke", side: "side_a" }),
      lineup({ id: "c", util: "smoke", side: "side_a" }),
    ]);
    expect(ids(group.lineups)).toEqual(["a", "b", "c"]);
  });

  it("buckets lineups without a target zone under Unknown Zone", () => {
    const groups = groupByZone([lineup({ id: "1", zone: null })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].zoneName).toBe("Unknown Zone");
    expect(groups[0].zoneSlug).toBe("unknown");
  });

  it("does not mutate the input array", () => {
    const input = [
      lineup({ id: "1", zone: "Window", zoneSlug: "window" }),
      lineup({ id: "2", zone: "A Site", zoneSlug: "a-site" }),
    ];
    groupByZone(input);
    expect(ids(input)).toEqual(["1", "2"]);
  });
});

describe("buildEmptyMessage", () => {
  it("says no lineups yet when unfiltered", () => {
    expect(buildEmptyMessage("Mirage", "any", [])).toBe("No lineups on Mirage yet.");
  });

  it("names the side when only the side is filtered", () => {
    expect(buildEmptyMessage("Mirage", "side_a", [])).toBe("No T lineups on this map.");
    expect(buildEmptyMessage("Mirage", "side_b", [])).toBe("No CT lineups on this map.");
  });

  it("names the utilities when only utilities are filtered", () => {
    expect(buildEmptyMessage("Mirage", "any", ["smoke"])).toBe("No smoke lineups on this map.");
    expect(buildEmptyMessage("Mirage", "any", ["smoke", "flash"])).toBe(
      "No smoke, flash lineups on this map.",
    );
  });

  it("puts utilities before the side when both are filtered", () => {
    expect(buildEmptyMessage("Mirage", "side_b", ["smoke"])).toBe("No smoke CT lineups on this map.");
  });

  it("ignores an unrecognized side value", () => {
    expect(buildEmptyMessage("Mirage", "bogus", [])).toBe("No lineups on Mirage yet.");
  });
});
