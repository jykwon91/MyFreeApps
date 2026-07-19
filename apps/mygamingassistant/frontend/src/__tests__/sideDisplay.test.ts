/**
 * sideDisplay unit tests — the unified T/CT chip token map that replaced
 * two independently-drifted color pairs (GlanceBoardTile's gold/blue vs
 * LineupListRow's orange/sky).
 */
import { describe, expect, it } from "vitest";
import { sideDisplay } from "@/constants/sideDisplay";

describe("sideDisplay", () => {
  it("side_a resolves to the gold tokens + 'T' fallback label", () => {
    const cfg = sideDisplay("side_a");
    expect(cfg.bg).toContain("bg-yellow-500/20");
    expect(cfg.text).toContain("text-yellow-600");
    expect(cfg.label).toBe("T");
  });

  it("side_b resolves to the blue tokens + 'CT' fallback label", () => {
    const cfg = sideDisplay("side_b");
    expect(cfg.bg).toContain("bg-blue-500/20");
    expect(cfg.text).toContain("text-blue-600");
    expect(cfg.label).toBe("CT");
  });

  it("'any' resolves to neutral tokens + 'Both' label", () => {
    const cfg = sideDisplay("any");
    expect(cfg.bg).toContain("bg-muted");
    expect(cfg.label).toBe("Both");
  });

  it("null/undefined side degrades to the neutral 'any' tokens — never throws", () => {
    expect(sideDisplay(null).label).toBe("Both");
    expect(sideDisplay(undefined).label).toBe("Both");
  });

  it("unrecognized side string degrades to the neutral 'any' tokens", () => {
    expect(sideDisplay("bogus").label).toBe("Both");
  });

  it("uses the game's side labels when provided (e.g. Valorant Atk/Def)", () => {
    const labels = { side_a_label: "Atk", side_b_label: "Def" };
    expect(sideDisplay("side_a", labels).label).toBe("Atk");
    expect(sideDisplay("side_b", labels).label).toBe("Def");
  });

  it("falls back to T/CT when labels are provided but null", () => {
    const labels = { side_a_label: null, side_b_label: null };
    expect(sideDisplay("side_a", labels).label).toBe("T");
    expect(sideDisplay("side_b", labels).label).toBe("CT");
  });
});
