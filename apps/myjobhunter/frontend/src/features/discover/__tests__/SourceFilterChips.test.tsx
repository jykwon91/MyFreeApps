/**
 * Tests for SourceFilterChips — filter-chip strip on the Discover page.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SourceFilterChips from "../SourceFilterChips";
import type { DiscoverySource } from "@/types/discovery/discovery-source";

function makeSource(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: "src-1",
    source: "jsearch",
    name: "Python remote",
    config: {},
    is_active: true,
    fetch_interval_minutes: 1440,
    last_fetched_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    consecutive_failures: 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("SourceFilterChips", () => {
  it("renders nothing when sources list is empty", () => {
    const { container } = render(
      <SourceFilterChips sources={[]} activeSourceId={null} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an 'All' chip plus one chip per source", () => {
    const sources = [
      makeSource({ id: "src-1", name: "Python backend" }),
      makeSource({ id: "src-2", name: "Frontend React" }),
    ];
    render(
      <SourceFilterChips sources={sources} activeSourceId={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByTestId("source-chip-all")).toBeInTheDocument();
    expect(screen.getByTestId("source-chip-src-1")).toBeInTheDocument();
    expect(screen.getByTestId("source-chip-src-2")).toBeInTheDocument();
    expect(screen.getByText("Python backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend React")).toBeInTheDocument();
  });

  it("uses source.source as fallback label when name is empty", () => {
    const sources = [makeSource({ id: "src-1", name: "", source: "jsearch" })];
    render(
      <SourceFilterChips sources={sources} activeSourceId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("jsearch")).toBeInTheDocument();
  });

  it("marks 'All' chip as active (aria-pressed=true) when activeSourceId is null", () => {
    const sources = [makeSource()];
    render(
      <SourceFilterChips sources={sources} activeSourceId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId("source-chip-all")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("source-chip-src-1")).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the matching source chip as active when activeSourceId is set", () => {
    const sources = [
      makeSource({ id: "src-1" }),
      makeSource({ id: "src-2" }),
    ];
    render(
      <SourceFilterChips sources={sources} activeSourceId="src-2" onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId("source-chip-all")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("source-chip-src-1")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("source-chip-src-2")).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onSelect with null when 'All' chip is clicked", () => {
    const onSelect = vi.fn();
    const sources = [makeSource()];
    render(
      <SourceFilterChips sources={sources} activeSourceId="src-1" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("source-chip-all"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("calls onSelect with the source id when a source chip is clicked", () => {
    const onSelect = vi.fn();
    const sources = [makeSource({ id: "src-42" })];
    render(
      <SourceFilterChips sources={sources} activeSourceId={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("source-chip-src-42"));
    expect(onSelect).toHaveBeenCalledWith("src-42");
  });
});
