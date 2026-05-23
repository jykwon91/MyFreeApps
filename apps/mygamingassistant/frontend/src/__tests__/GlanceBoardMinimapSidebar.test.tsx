/**
 * GlanceBoardMinimapSidebar unit tests.
 *
 * Two click modes:
 *  - Default (no onZoneClick): polygon clicks call scrollToZone (smooth-
 *    scroll to the section anchor). We assert the default DOES NOT raise
 *    when no onZoneClick is provided.
 *  - With onZoneClick: polygon clicks invoke the parent callback so MapPage
 *    can set the zone filter URL param. activeZoneSlug highlights the
 *    matching polygon.
 *
 * Includes the text-list fallback (minimap unavailable) and the active-zone
 * highlight in both surfaces.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlanceBoardMinimapSidebar from "@/components/lineup/GlanceBoardMinimapSidebar";
import type { MapZone, ZoneDensity } from "@/types/game";

const ZONES: MapZone[] = [
  {
    id: "z1",
    slug: "a-site",
    name: "A Site",
    polygon_points: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 },
      { x: 0.4, y: 0.4 },
      { x: 0.1, y: 0.4 },
    ],
  },
  {
    id: "z2",
    slug: "b-site",
    name: "B Site",
    polygon_points: [
      { x: 0.6, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.4 },
      { x: 0.6, y: 0.4 },
    ],
  },
];

const DENSITY: ZoneDensity = {
  z1: { count: 5, by_utility: { smoke: 3, flash: 2 } },
  z2: { count: 3, by_utility: { smoke: 2, molotov: 1 } },
};

describe("GlanceBoardMinimapSidebar (text-list fallback)", () => {
  it("renders zone buttons when minimapUrl is null", () => {
    const onZoneClick = vi.fn();
    render(
      <GlanceBoardMinimapSidebar
        minimapUrl={null}
        zones={ZONES}
        density={DENSITY}
        onZoneClick={onZoneClick}
        activeZoneSlug={null}
      />,
    );
    expect(screen.getByText("A Site")).toBeInTheDocument();
    expect(screen.getByText("B Site")).toBeInTheDocument();
  });

  it("invokes onZoneClick from the fallback list when provided", () => {
    const onZoneClick = vi.fn();
    render(
      <GlanceBoardMinimapSidebar
        minimapUrl={null}
        zones={ZONES}
        density={DENSITY}
        onZoneClick={onZoneClick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /A Site/ }));
    expect(onZoneClick).toHaveBeenCalledWith("a-site");
  });

  it("marks the active zone with aria-pressed in the fallback list", () => {
    render(
      <GlanceBoardMinimapSidebar
        minimapUrl={null}
        zones={ZONES}
        density={DENSITY}
        onZoneClick={vi.fn()}
        activeZoneSlug="a-site"
      />,
    );
    expect(screen.getByRole("button", { name: /A Site/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /B Site/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("GlanceBoardMinimapSidebar (svg polygon mode)", () => {
  it("invokes onZoneClick when a polygon is clicked", () => {
    const onZoneClick = vi.fn();
    render(
      <GlanceBoardMinimapSidebar
        minimapUrl="/mock/minimap.png"
        zones={ZONES}
        density={DENSITY}
        onZoneClick={onZoneClick}
      />,
    );
    // The polygons are aria-labelled with zone name + action hint
    const aSitePoly = screen.getByLabelText(/A Site/);
    fireEvent.click(aSitePoly);
    expect(onZoneClick).toHaveBeenCalledWith("a-site");
  });

  it("does NOT throw when no onZoneClick is provided (default scroll-to-section path)", () => {
    expect(() => {
      render(
        <GlanceBoardMinimapSidebar
          minimapUrl="/mock/minimap.png"
          zones={ZONES}
          density={DENSITY}
        />,
      );
      const aSitePoly = screen.getByLabelText(/A Site/);
      fireEvent.click(aSitePoly);
    }).not.toThrow();
  });

  it("annotates the active polygon with aria-pressed=true", () => {
    render(
      <GlanceBoardMinimapSidebar
        minimapUrl="/mock/minimap.png"
        zones={ZONES}
        density={DENSITY}
        onZoneClick={vi.fn()}
        activeZoneSlug="b-site"
      />,
    );
    expect(screen.getByLabelText(/B Site.*currently filtered/)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText(/A Site.*click to filter/)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("uses the scroll aria-label text when no onZoneClick is provided", () => {
    render(
      <GlanceBoardMinimapSidebar
        minimapUrl="/mock/minimap.png"
        zones={ZONES}
        density={DENSITY}
      />,
    );
    expect(screen.getByLabelText(/A Site.*click to scroll/)).toBeInTheDocument();
  });
});
