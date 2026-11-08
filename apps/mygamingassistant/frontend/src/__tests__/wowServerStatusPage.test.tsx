/**
 * WoW Forever server status page — history states, the span toggle, outages and the login-error search.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import WowServerStatusPage from "@/games/wow-forever/pages/WowServerStatusPage";
import type { ServerStatusHistoryResponse } from "@/games/wow-forever/types/serverStatus/serverStatusHistoryResponse";

const mockStatus = vi.fn();
const mockHistory = vi.fn();
vi.mock("@/games/wow-forever/api/wowServerStatusApi", () => ({
  useGetServerStatusQuery: (region: string, opts: unknown) => mockStatus(region, opts),
  useGetServerStatusHistoryQuery: (region: string, opts: unknown) => mockHistory(region, opts),
  SERVER_STATUS_POLLING: {},
  SERVER_STATUS_HISTORY_POLLING: {},
}));

const NOW = "2026-11-07T12:00:00Z";

function iso(hoursAgo: number): string {
  return new Date(Date.parse(NOW) - hoursAgo * 3_600_000).toISOString();
}

const HISTORY: ServerStatusHistoryResponse = {
  region: "us",
  generated_at: NOW,
  window_start: iso(168),
  check_interval_seconds: 300,
  max_gap_seconds: 4200,
  rulesets: [
    {
      slug: "normal",
      name: "Normal",
      since: iso(28),
      since_exact: true,
      // Hourly checkpoints: up, one hour down 29 h ago, then up ever since.
      points: Array.from({ length: 31 }, (_, i) => ({ at: iso(30 - i), status: i === 1 ? "down" : "up" })),
    },
    {
      slug: "pvp",
      name: "PvP",
      since: iso(1),
      since_exact: true,
      points: [
        { at: iso(5), status: "up" },
        { at: iso(4), status: "up" },
        { at: iso(3), status: "up" },
        { at: iso(2), status: "up" },
        { at: iso(1), status: "down" },
        { at: iso(0.1), status: "down" },
      ],
    },
  ],
};

function query(data: ServerStatusHistoryResponse | undefined, extra: Record<string, boolean> = {}) {
  return { data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), ...extra };
}

function LocationProbe() {
  const { search, hash } = useLocation();
  return <output data-testid="location">{`${search}${hash}`}</output>;
}

function renderPage(path = "/wow-forever/server-status") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/wow-forever/server-status"
          element={
            <>
              <WowServerStatusPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  Element.prototype.scrollIntoView = vi.fn();
  mockStatus.mockReturnValue(query(undefined));
  mockHistory.mockReturnValue(query(HISTORY));
});
afterEach(() => vi.useRealTimers());

describe("WowServerStatusPage — history", () => {
  it("shows the skeleton while the history loads", () => {
    mockHistory.mockReturnValue(query(undefined, { isLoading: true }));
    renderPage();
    expect(screen.getByLabelText("Loading uptime history")).toBeInTheDocument();
  });

  it("offers a retry when the history fails", () => {
    const refetch = vi.fn();
    mockHistory.mockReturnValue({ ...query(undefined, { isError: true }), refetch });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("explains an empty history", () => {
    mockHistory.mockReturnValue(query({ ...HISTORY, rulesets: [] }));
    renderPage();
    expect(screen.getByText(/Nothing recorded for this region yet/)).toBeInTheDocument();
  });

  it("shows each ruleset's streak, uptime and a timeline bar", () => {
    renderPage();
    const rows = within(screen.getByRole("list", { name: "Uptime by ruleset" })).getAllByTestId("ruleset-history");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Up for 1 d 4 h")).toBeInTheDocument();
    expect(within(rows[0]).getByText("100% up")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^Down since /)).toBeInTheDocument();
    expect(within(rows[1]).getByRole("img", { name: /^PvP: up 80% of the recorded time in the last 24 hours$/ })).toBeInTheDocument();
  });

  it("switches to 7 days and keeps it in the URL", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(screen.getByTestId("location")).toHaveTextContent("?range=7d");
    expect(screen.getByRole("img", { name: /^Normal: .*last 7 days$/ })).toBeInTheDocument();
  });

  it("lists the week's outages, the ongoing one first", () => {
    renderPage();
    const items = within(screen.getByRole("list", { name: "Recent outages" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("PvP");
    expect(items[0]).toHaveTextContent("Ongoing, 1 h");
    expect(items[1]).toHaveTextContent("Normal");
    expect(items[1]).toHaveTextContent("1 h");
  });

  it("names the reader's time zone", () => {
    renderPage();
    expect(screen.getByText(new RegExp(`Times are in your time zone \\(${Intl.DateTimeFormat().resolvedOptions().timeZone}\\)`))).toBeInTheDocument();
  });
});

describe("WowServerStatusPage — login errors", () => {
  it("filters the errors as you type a code", () => {
    renderPage();
    const list = screen.getByRole("list", { name: "Login errors" });
    expect(within(list).getAllByRole("heading").length).toBeGreaterThan(5);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search login errors" }), { target: { value: "51900319" } });
    const headings = within(screen.getByRole("list", { name: "Login errors" })).getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("WOW51900319");
  });

  it("says when nothing matches", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search login errors" }), { target: { value: "zzqx" } });
    expect(screen.getByText(/No error matches that/)).toBeInTheDocument();
  });

  it("highlights and scrolls to the error a deep link names", () => {
    renderPage("/wow-forever/server-status#err-character-not-found");
    const card = document.getElementById("err-character-not-found");
    expect(card).toHaveAttribute("data-targeted", "true");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(within(card as HTMLElement).getByRole("link", { name: "Link to this error" })).toHaveAttribute(
      "href",
      "#err-character-not-found",
    );
  });

  it("tags every error with a provenance badge", () => {
    renderPage();
    const cards = within(screen.getByRole("list", { name: "Login errors" })).getAllByTestId("provenance-badge");
    cards.forEach((badge) => expect(badge).toHaveAttribute("data-provenance", "classic"));
  });
});
