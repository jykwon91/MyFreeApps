// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INBOX_POLL_INTERVAL_MS, SCORING_WINDOW_MS } from "../constants/discoverScoring";
import { useScoringWindow } from "../hooks/useScoringWindow";

describe("useScoringWindow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays closed when the unscored count rises without a refresh, as when the filter widens to All or a dismiss is undone", () => {
    const { result } = renderHook(() => useScoringWindow(null));

    act(() => result.current.observe(3)); // a saved search's inbox
    act(() => result.current.observe(40)); // switched to All
    act(() => result.current.observe(41)); // a dismiss undone

    expect(result.current.isOpen).toBe(false);
    expect(result.current.pollingInterval).toBe(0);
  });

  it("opens on a refresh that worked and polls until its time is up", () => {
    const { result } = renderHook(() => useScoringWindow(null));
    act(() => result.current.observe(5));

    act(() => result.current.open("src-a"));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.pollingInterval).toBe(INBOX_POLL_INTERVAL_MS);
    act(() => result.current.observe(8));

    act(() => vi.advanceTimersByTime(SCORING_WINDOW_MS));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.pollingInterval).toBe(0);
  });

  it("opens for a refresh of the saved search the inbox is filtered to", () => {
    const { result } = renderHook(() => useScoringWindow("src-a"));
    act(() => result.current.open("src-a"));
    expect(result.current.isOpen).toBe(true);
  });

  it("stays closed for a refresh of another saved search than the one the inbox is filtered to", () => {
    const { result } = renderHook(() => useScoringWindow("src-a"));

    act(() => result.current.open("src-b"));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.pollingInterval).toBe(0);
  });

  it("closes as soon as nothing is left unscored", () => {
    const { result } = renderHook(() => useScoringWindow(null));
    act(() => result.current.open("src-a"));

    act(() => result.current.observe(0));

    expect(result.current.isOpen).toBe(false);
  });

  it("restarts its time on another refresh", () => {
    const { result } = renderHook(() => useScoringWindow(null));
    act(() => result.current.open("src-a"));
    act(() => vi.advanceTimersByTime(SCORING_WINDOW_MS - 1000));

    act(() => result.current.open("src-a"));
    act(() => vi.advanceTimersByTime(SCORING_WINDOW_MS - 1000));

    expect(result.current.isOpen).toBe(true);
  });
});
