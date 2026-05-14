/**
 * Tests for LiveTopBar — its pure helpers + full-component render
 * assertions. The component is presentational only (no state), so most
 * tests focus on the helpers + the segment-by-segment rendering rules
 * introduced in PR 10.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveTopBar from "@/components/live/LiveTopBar";
import type { LiveBarFields } from "@/lib/gsi";
import {
  connectionStateFromProps,
  formatLastEventTime,
  formatZone,
  roundPhaseChipClasses,
} from "@/components/live/liveTopBarUtils";

// ---------------------------------------------------------------------------
// Helper: build a complete LiveBarFields fixture with optional overrides.
// Avoids 7 hard-coded null fields in every test that doesn't care about them.
// ---------------------------------------------------------------------------
function buildLiveBar(overrides: Partial<LiveBarFields> = {}): LiveBarFields {
  return {
    mapDisplay: "Mirage",
    sideDisplay: "CT",
    phaseDisplay: "Live",
    roundPhaseDisplay: null,
    scoreDisplay: null,
    moneyDisplay: null,
    equipExtra: "",
    bombDisplay: null,
    ...overrides,
  };
}

const DEFAULT_OVERRIDE = {
  enabled: false,
  mapSlug: "",
  side: "any" as const,
  utility: null,
};

// ===========================================================================
// connectionStateFromProps
// ===========================================================================

describe("connectionStateFromProps", () => {
  it("returns Initializing when not ready", () => {
    const result = connectionStateFromProps(false, false, 0);
    expect(result.label).toBe("Initializing");
  });

  it("returns Offline when ready but not running", () => {
    const result = connectionStateFromProps(true, false, 0);
    expect(result.label).toBe("Offline");
    expect(result.color).toContain("destructive");
  });

  it("returns Waiting when running but zero payloads", () => {
    const result = connectionStateFromProps(true, true, 0);
    expect(result.label).toBe("Waiting");
    expect(result.color).toContain("amber");
  });

  it("returns Connected once at least one payload arrives", () => {
    const result = connectionStateFromProps(true, true, 1);
    expect(result.label).toBe("Connected");
    expect(result.color).toContain("green");
  });
});

// ===========================================================================
// formatLastEventTime
// ===========================================================================

describe("formatLastEventTime", () => {
  const NOW = new Date("2026-05-13T10:00:00Z");

  it("returns 'just now' for very recent events", () => {
    expect(formatLastEventTime("2026-05-13T09:59:58Z", NOW)).toBe("just now");
  });

  it("formats seconds correctly", () => {
    expect(formatLastEventTime("2026-05-13T09:59:30Z", NOW)).toBe("30s ago");
  });

  it("formats minutes correctly", () => {
    expect(formatLastEventTime("2026-05-13T09:55:00Z", NOW)).toBe("5m ago");
  });

  it("formats hours correctly", () => {
    expect(formatLastEventTime("2026-05-13T08:00:00Z", NOW)).toBe("2h ago");
  });

  it("returns dash for unparseable input", () => {
    expect(formatLastEventTime("not a date", NOW)).toBe("—");
  });
});

// ===========================================================================
// formatZone + roundPhaseChipClasses (PR 10 helpers)
// ===========================================================================

describe("formatZone", () => {
  it("returns null for null/empty inputs", () => {
    expect(formatZone(null)).toBeNull();
    expect(formatZone("")).toBeNull();
    expect(formatZone(undefined)).toBeNull();
  });
  it("capitalizes kebab-case slugs", () => {
    expect(formatZone("a-site")).toBe("A Site");
    expect(formatZone("b-apts")).toBe("B Apts");
  });
  it("capitalizes snake_case slugs", () => {
    expect(formatZone("ct_spawn")).toBe("Ct Spawn");
  });
});

describe("roundPhaseChipClasses", () => {
  it("picks sky tint for Freezetime", () => {
    expect(roundPhaseChipClasses("Freezetime")).toContain("sky");
  });
  it("picks green tint for Live", () => {
    expect(roundPhaseChipClasses("Live")).toContain("green");
  });
  it("picks muted tint for Over", () => {
    expect(roundPhaseChipClasses("Over")).toContain("muted");
  });
  it("falls back to a neutral default for unknown labels", () => {
    expect(roundPhaseChipClasses("???")).toContain("muted");
  });
});

// ===========================================================================
// LiveTopBar — base rendering
// ===========================================================================

describe("LiveTopBar component — base rendering", () => {
  it("shows 'Waiting for CS2' when no event yet", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={0}
        lastEventAt={undefined}
        liveBar={null}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    expect(screen.getByText(/Waiting for CS2/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Receiver: Waiting/i),
    ).toBeInTheDocument();
  });

  it("displays map / side / phase when a live bar summary is present", () => {
    const { container } = render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    const headerText = container.textContent ?? "";
    expect(headerText).toContain("Mirage");
    expect(headerText).toContain("CT");
    expect(screen.getByLabelText(/Receiver: Connected/i)).toBeInTheDocument();
  });

  it("shows override label when override is enabled", () => {
    const { container } = render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={0}
        lastEventAt={undefined}
        liveBar={null}
        override={{ enabled: true, mapSlug: "dust2", side: "side_a", utility: null }}
        onOverrideToggle={() => undefined}
      />,
    );
    const headerText = container.textContent ?? "";
    expect(headerText).toContain("dust2");
    expect(headerText).toContain("T");
    expect(headerText).toContain("(override)");
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
  });
});

// ===========================================================================
// LiveTopBar — zone segment (PR 9a)
// ===========================================================================

describe("LiveTopBar — zone segment (PR 9a)", () => {
  it("does NOT render zone segment when zoneSlug is null", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
        zoneSlug={null}
      />,
    );
    expect(screen.queryByTestId("live-zone")).not.toBeInTheDocument();
  });

  it("renders zone segment when zoneSlug is provided", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
        zoneSlug="b-site"
      />,
    );
    const zone = screen.getByTestId("live-zone");
    expect(zone).toBeInTheDocument();
    expect(zone.textContent).toBe("B Site");
  });

  it("formats kebab-case zone slugs nicely", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
        zoneSlug="b-apts"
      />,
    );
    expect(screen.getByTestId("live-zone").textContent).toBe("B Apts");
  });

  it("hides zone segment when override is enabled (manual mode wins)", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={0}
        lastEventAt={undefined}
        liveBar={null}
        override={{ enabled: true, mapSlug: "dust2", side: "side_a", utility: null }}
        onOverrideToggle={() => undefined}
        zoneSlug="a-site"
      />,
    );
    expect(screen.queryByTestId("live-zone")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// LiveTopBar — PR 10: utility badge
// ===========================================================================

describe("LiveTopBar — utility badge (PR 10)", () => {
  it("does NOT render utility badge when filter is null", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
        utilityFilter={null}
      />,
    );
    expect(screen.queryByTestId("live-utility")).not.toBeInTheDocument();
  });

  it("renders utility badge with the label of a single slug filter", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
        utilityFilter={["smoke"]}
      />,
    );
    const utility = screen.getByTestId("live-utility");
    expect(utility.textContent).toBe("Smoke");
  });

  it("renders +N indicator when multiple utility slugs are filtered", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
        utilityFilter={["smoke", "flash", "grenade"]}
      />,
    );
    const utility = screen.getByTestId("live-utility");
    expect(utility.textContent).toBe("Smoke +2");
  });

  it("renders override utility label when override is enabled", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={0}
        lastEventAt={undefined}
        liveBar={null}
        override={{ enabled: true, mapSlug: "mirage", side: "side_b", utility: "flash" }}
        onOverrideToggle={() => undefined}
      />,
    );
    const utility = screen.getByTestId("live-utility");
    expect(utility.textContent).toBe("Flash");
  });
});

// ===========================================================================
// LiveTopBar — PR 10: score / money / bomb / round phase segments
// ===========================================================================

describe("LiveTopBar — expanded HUD segments (PR 10)", () => {
  it("renders the score segment when both scores present", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar({ scoreDisplay: "12-8" })}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    expect(screen.getByTestId("live-score").textContent).toBe("12-8");
  });

  it("hides the score segment when scoreDisplay is null", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar({ scoreDisplay: null })}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    expect(screen.queryByTestId("live-score")).not.toBeInTheDocument();
  });

  it("renders money segment with equipExtra suffix when present", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar({ moneyDisplay: "$4,150", equipExtra: " +kit" })}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    const money = screen.getByTestId("live-money");
    expect(money.textContent).toContain("$4,150");
    expect(money.textContent).toContain("+kit");
  });

  it("renders bomb segment when bombDisplay is set", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar({ bombDisplay: "💣 planted" })}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    expect(screen.getByTestId("live-bomb").textContent).toContain("planted");
  });

  it("renders round-phase chip when roundPhaseDisplay is set", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar({ roundPhaseDisplay: "Freezetime" })}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    expect(screen.getByTestId("live-round-phase").textContent).toBe("Freezetime");
  });

  it("hides round-phase chip when roundPhaseDisplay is null", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={buildLiveBar()}
        override={DEFAULT_OVERRIDE}
        onOverrideToggle={() => undefined}
      />,
    );
    expect(screen.queryByTestId("live-round-phase")).not.toBeInTheDocument();
  });
});
