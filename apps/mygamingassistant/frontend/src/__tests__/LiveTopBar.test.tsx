/**
 * Tests for LiveTopBar — its pure helpers + a couple of full-component
 * render assertions. The component is presentational only (no state), so
 * exhaustive testing focuses on the helpers.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveTopBar from "@/components/live/LiveTopBar";
import {
  connectionStateFromProps,
  formatLastEventTime,
} from "@/components/live/liveTopBarUtils";

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

describe("LiveTopBar component", () => {
  it("shows 'Waiting for CS2' when no event yet", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={0}
        lastEventAt={undefined}
        liveBar={null}
        override={{ enabled: false, mapSlug: "", side: "any" }}
        onOverrideToggle={() => undefined}
      />,
    );
    expect(screen.getByText(/Waiting for CS2/i)).toBeInTheDocument();
    // Connection-state label flips to "Waiting" — distinct element from
    // the "Waiting for CS2…" placeholder. Match via aria-label so we don't
    // pick up the placeholder text.
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
        liveBar={{
          mapDisplay: "Mirage",
          sideDisplay: "CT",
          phaseDisplay: "Live",
        }}
        override={{ enabled: false, mapSlug: "", side: "any" }}
        onOverrideToggle={() => undefined}
      />,
    );
    // Map / side / phase are split across nested <span>s. Assert on the
    // header's full textContent so we don't depend on DOM structure.
    const headerText = container.textContent ?? "";
    expect(headerText).toContain("Mirage");
    expect(headerText).toContain("CT");
    expect(headerText).toContain("Live");
    // Status label flips to Connected when payloads > 0.
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
        override={{ enabled: true, mapSlug: "dust2", side: "side_a" }}
        onOverrideToggle={() => undefined}
      />,
    );
    const headerText = container.textContent ?? "";
    expect(headerText).toContain("dust2");
    expect(headerText).toContain("T");
    expect(headerText).toContain("(override)");
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
  });

  // PR 9a — zone segment
  it("does NOT render zone segment when zoneSlug is null", () => {
    render(
      <LiveTopBar
        ready={true}
        running={true}
        payloadsReceived={5}
        lastEventAt={undefined}
        liveBar={{
          mapDisplay: "Mirage",
          sideDisplay: "CT",
          phaseDisplay: "Live",
        }}
        override={{ enabled: false, mapSlug: "", side: "any" }}
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
        liveBar={{
          mapDisplay: "Mirage",
          sideDisplay: "CT",
          phaseDisplay: "Live",
        }}
        override={{ enabled: false, mapSlug: "", side: "any" }}
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
        liveBar={{
          mapDisplay: "Mirage",
          sideDisplay: "CT",
          phaseDisplay: "Live",
        }}
        override={{ enabled: false, mapSlug: "", side: "any" }}
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
        override={{ enabled: true, mapSlug: "dust2", side: "side_a" }}
        onOverrideToggle={() => undefined}
        zoneSlug="a-site"
      />,
    );
    // Even though zoneSlug is set, override mode hides the zone segment —
    // the operator is manually picking map+side; zone narrowing doesn't
    // apply.
    expect(screen.queryByTestId("live-zone")).not.toBeInTheDocument();
  });
});
