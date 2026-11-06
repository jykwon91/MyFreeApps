/**
 * WoW Forever server status — unit tests.
 *
 * Covers:
 *   - relativeTime utility formatting edge cases
 *   - WowServerStatusSection renders skeleton while loading
 *   - WowServerStatusSection renders all-online summary + ruleset list
 *   - WowServerStatusSection renders a partial-outage summary
 *   - WowServerStatusSection renders the error state with retry button
 *   - Region picker persists to localStorage
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import WowServerStatusSection from "@/games/wow-forever/components/serverStatus/WowServerStatusSection";

// ---------------------------------------------------------------------------
// Mock the RTK query hook so the component can be rendered without a Redux store.
// ---------------------------------------------------------------------------
const mockUseGetServerStatusQuery = vi.fn();
vi.mock("@/games/wow-forever/api/wowServerStatusApi", () => ({
  useGetServerStatusQuery: (region: string, opts: unknown) =>
    mockUseGetServerStatusQuery(region, opts),
  SERVER_STATUS_POLLING: { pollingInterval: 90_000, skipPollingIfUnfocused: true },
}));

const CHECKED_AT = "2026-11-06T12:00:00Z";

const ALL_ONLINE = {
  region: "us",
  checked_at: CHECKED_AT,
  rulesets: [
    { name: "Normal", slug: "normal", online: true },
    { name: "PvP", slug: "pvp", online: true },
    { name: "Roleplay", slug: "roleplay", online: true },
    { name: "Roleplay PvP", slug: "roleplay-pvp", online: true },
  ],
};

const ONE_DOWN = {
  region: "us",
  checked_at: CHECKED_AT,
  rulesets: [
    { name: "Normal", slug: "normal", online: true },
    { name: "PvP", slug: "pvp", online: false },
    { name: "Roleplay", slug: "roleplay", online: true },
    { name: "Roleplay PvP", slug: "roleplay-pvp", online: true },
  ],
};

function renderSection() {
  render(
    <MemoryRouter>
      <WowServerStatusSection />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// relativeTime utility
// ---------------------------------------------------------------------------

describe("relativeTime", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("returns 'just now' for <10 s ago", () => {
    vi.setSystemTime(new Date("2026-11-06T12:00:05Z"));
    expect(relativeTime("2026-11-06T12:00:00Z")).toBe("just now");
  });

  it("returns seconds for 10–89 s ago", () => {
    vi.setSystemTime(new Date("2026-11-06T12:00:45Z"));
    expect(relativeTime("2026-11-06T12:00:00Z")).toBe("45 seconds ago");
  });

  it("returns '1 minute ago' for ~60 s", () => {
    vi.setSystemTime(new Date("2026-11-06T12:01:30Z"));
    expect(relativeTime("2026-11-06T12:00:00Z")).toBe("2 minutes ago");
    vi.setSystemTime(new Date("2026-11-06T12:01:00Z"));
    expect(relativeTime("2026-11-06T12:00:00Z")).toBe("1 minute ago");
  });

  it("rounds minutes for longer durations", () => {
    vi.setSystemTime(new Date("2026-11-06T12:05:00Z"));
    expect(relativeTime("2026-11-06T12:00:00Z")).toBe("5 minutes ago");
  });
});

// ---------------------------------------------------------------------------
// WowServerStatusSection component
// ---------------------------------------------------------------------------

describe("WowServerStatusSection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(CHECKED_AT));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the skeleton while loading", () => {
    mockUseGetServerStatusQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByRole("region", { name: "WoW Forever server status" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading server status")).toBeInTheDocument();
  });

  it("renders all-online summary and 4 rulesets", () => {
    mockUseGetServerStatusQuery.mockReturnValue({
      data: ALL_ONLINE,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByText("All servers online")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Server rulesets" })).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText("PvP")).toBeInTheDocument();
    expect(screen.getByText("Roleplay")).toBeInTheDocument();
    expect(screen.getByText("Roleplay PvP")).toBeInTheDocument();
  });

  it("renders partial outage summary", () => {
    mockUseGetServerStatusQuery.mockReturnValue({
      data: ONE_DOWN,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByText(/1 of 4 servers offline/)).toBeInTheDocument();
  });

  it("renders the error state with a retry button", () => {
    const refetch = vi.fn();
    mockUseGetServerStatusQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });
    renderSection();
    expect(screen.getByText(/Couldn't reach Blizzard's status page/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("clicking retry calls refetch", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const refetch = vi.fn();
    mockUseGetServerStatusQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });
    renderSection();
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("region picker persists to localStorage", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockUseGetServerStatusQuery.mockReturnValue({
      data: ALL_ONLINE,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection();
    const select = screen.getByRole("combobox", { name: "Region" });
    await user.selectOptions(select, "eu");
    const stored = JSON.parse(window.localStorage.getItem("mga.wowForever.serverStatus.region.v1") ?? "null");
    expect(stored).toBe("eu");
  });
});
