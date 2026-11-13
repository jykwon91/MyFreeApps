/**
 * "Refresh now" on the guild page: loading at the click, waiting for the roster time to move, the
 * cooldown, the server's refusals, and no button for any guild but the operator's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { showError, showSuccess } from "@platform/ui";
import GuildRefreshButton from "@/games/wow-forever/components/guild/GuildRefreshButton";
import GuildSummary from "@/games/wow-forever/components/guild/GuildSummary";
import {
  GUILD_REFRESH_COPY,
  GUILD_REFRESH_POLL_MS,
  GUILD_REFRESH_WATCH_TIMEOUT_MS,
} from "@/games/wow-forever/data/guild/guildRefreshConfig";
import { refreshCooldownCopy } from "@/games/wow-forever/data/refreshCooldownCopy";
import { cooldownLeftMs, cooldownMinutes } from "@/games/wow-forever/lib/refreshCooldown";
import type { GuildRefreshResponse } from "@/games/wow-forever/types/guild/guildRefreshResponse";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

const mockStart = vi.fn();
vi.mock("@/games/wow-forever/api/wowGuildApi", () => ({
  useRefreshGuildMutation: () => [(slug: string) => ({ unwrap: () => mockStart(slug) })],
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const MINUTE_MS = 60_000;
const OLD_ROSTER_AT = new Date(Date.now() - 2 * 3_600_000).toISOString();
const NEW_ROSTER_AT = new Date().toISOString();

function guild(overrides: Partial<GuildResponse> = {}): GuildResponse {
  return {
    slug: "topdeadcenter",
    name: "TopDeadCenter",
    faction: "alliance",
    roster_size: 1,
    roster_updated_at: OLD_ROSTER_AT,
    refresh_failed: false,
    refresh_failed_at: null,
    can_refresh: true,
    refresh_available_at: new Date(Date.now() - MINUTE_MS).toISOString(),
    gone: false,
    gains_window_days: 7,
    members: [],
    ...overrides,
  };
}

function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * MINUTE_MS).toISOString();
}

function started(): GuildRefreshResponse {
  return { status: "started", retry_after_seconds: 300 };
}

async function click() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockStart.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("cooldown helpers", () => {
  it("counts down to the moment, never below zero, and rounds minutes up", () => {
    const now = Date.now();
    expect(cooldownLeftMs(null, now)).toBe(0);
    expect(cooldownLeftMs(new Date(now - 5).toISOString(), now)).toBe(0);
    expect(cooldownLeftMs(new Date(now + 90_000).toISOString(), now)).toBe(90_000);
    expect(cooldownMinutes(90_000)).toBe(2);
    expect(cooldownMinutes(1)).toBe(1);
  });
});

describe("GuildRefreshButton", () => {
  it("is ready to press, with a 44px touch target, when the guild can be refreshed", () => {
    render(<GuildRefreshButton guild={guild()} refetch={vi.fn()} />);
    const button = screen.getByRole("button", { name: GUILD_REFRESH_COPY.button });
    expect(button).toBeEnabled();
    expect(button.className).toContain("min-h-[44px]");
  });

  it("shows loading at the click, then success once the roster time moves", async () => {
    mockStart.mockResolvedValue(started());
    const refetch = vi.fn();
    const { rerender } = render(<GuildRefreshButton guild={guild()} refetch={refetch} />);

    await click();

    expect(mockStart).toHaveBeenCalledWith("topdeadcenter");
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.loading })).toBeDisabled();
    refetch.mockClear();
    act(() => void vi.advanceTimersByTime(GUILD_REFRESH_POLL_MS));
    expect(refetch).toHaveBeenCalled();

    rerender(
      <GuildRefreshButton guild={guild({ roster_updated_at: NEW_ROSTER_AT, refresh_available_at: inMinutes(5) })} refetch={refetch} />,
    );

    expect(showSuccess).toHaveBeenCalledWith(GUILD_REFRESH_COPY.success);
    expect(screen.queryByRole("button", { name: GUILD_REFRESH_COPY.loading })).toBeNull();
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.button })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(5));
  });

  it("says so when Blizzard did not answer the refresh", async () => {
    mockStart.mockResolvedValue(started());
    const { rerender } = render(<GuildRefreshButton guild={guild()} refetch={vi.fn()} />);
    await click();

    rerender(<GuildRefreshButton guild={guild({ refresh_failed: true, refresh_failed_at: NEW_ROSTER_AT })} refetch={vi.fn()} />);

    expect(showError).toHaveBeenCalledWith(GUILD_REFRESH_COPY.failed);
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("stops waiting after a while and says it is still running", async () => {
    mockStart.mockResolvedValue(started());
    render(<GuildRefreshButton guild={guild()} refetch={vi.fn()} />);
    await click();

    act(() => void vi.advanceTimersByTime(GUILD_REFRESH_WATCH_TIMEOUT_MS));

    expect(showError).toHaveBeenCalledWith(GUILD_REFRESH_COPY.slow);
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.button })).toBeEnabled();
  });

  it("is disabled during the cooldown and says for how long", () => {
    render(<GuildRefreshButton guild={guild({ refresh_available_at: inMinutes(3) })} refetch={vi.fn()} />);
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.button })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(3));
  });

  it("comes back on its own when the cooldown runs out", () => {
    render(<GuildRefreshButton guild={guild({ refresh_available_at: inMinutes(1) })} refetch={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(MINUTE_MS + 1));
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.button })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("explains a cooldown the server enforced (a click from another tab)", async () => {
    mockStart.mockResolvedValue({ status: "cooldown", retry_after_seconds: 120 });
    render(<GuildRefreshButton guild={guild()} refetch={vi.fn()} />);

    await click();

    expect(showError).toHaveBeenCalledWith(refreshCooldownCopy(2));
    // The server's wait is counted from now, so the button waits it out too.
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.button })).toBeDisabled();
  });

  it.each([
    [429, GUILD_REFRESH_COPY.tooMany],
    [500, GUILD_REFRESH_COPY.startFailed],
  ])("says what went wrong when the server answers %i", async (status, message) => {
    mockStart.mockRejectedValue({ status });
    render(<GuildRefreshButton guild={guild()} refetch={vi.fn()} />);

    await click();

    expect(showError).toHaveBeenCalledWith(message);
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.button })).toBeEnabled();
  });
});

describe("GuildSummary", () => {
  it("shows the button only for a guild that can be refreshed", () => {
    const { rerender } = render(<GuildSummary guild={guild()} refetch={vi.fn()} />);
    expect(screen.getByRole("button", { name: GUILD_REFRESH_COPY.button })).toBeTruthy();

    rerender(<GuildSummary guild={guild({ slug: "other-guild", can_refresh: false })} refetch={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
