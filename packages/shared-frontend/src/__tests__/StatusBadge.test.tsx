import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge, { type BadgeTone } from "../components/ui/StatusBadge";

const ALL_TONES: BadgeTone[] = ["neutral", "info", "success", "warning", "danger"];

describe("StatusBadge", () => {
  it.each(ALL_TONES)("renders the label for tone '%s'", (tone) => {
    render(<StatusBadge tone={tone} label={`Test ${tone}`} />);
    expect(screen.getByText(`Test ${tone}`)).toBeInTheDocument();
  });

  it("renders as a <span> element", () => {
    render(<StatusBadge tone="success" label="Active" />);
    expect(screen.getByText("Active").tagName).toBe("SPAN");
  });

  it("applies neutral tone classes for 'neutral'", () => {
    render(<StatusBadge tone="neutral" label="Ended" />);
    const el = screen.getByText("Ended");
    expect(el.className).toMatch(/bg-gray-100/);
    expect(el.className).toMatch(/text-gray-700/);
  });

  it("applies info tone classes for 'info'", () => {
    render(<StatusBadge tone="info" label="Pending" />);
    const el = screen.getByText("Pending");
    expect(el.className).toMatch(/bg-blue-100/);
    expect(el.className).toMatch(/text-blue-700/);
  });

  it("applies success tone classes for 'success'", () => {
    render(<StatusBadge tone="success" label="Active" />);
    const el = screen.getByText("Active");
    expect(el.className).toMatch(/bg-green-100/);
    expect(el.className).toMatch(/text-green-700/);
  });

  it("applies warning tone classes for 'warning'", () => {
    render(<StatusBadge tone="warning" label="Paused" />);
    const el = screen.getByText("Paused");
    expect(el.className).toMatch(/bg-yellow-100/);
    expect(el.className).toMatch(/text-yellow-700/);
  });

  it("applies danger tone classes for 'danger'", () => {
    render(<StatusBadge tone="danger" label="Archived" />);
    const el = screen.getByText("Archived");
    expect(el.className).toMatch(/bg-red-100/);
    expect(el.className).toMatch(/text-red-700/);
  });

  it("merges a custom className onto the base classes", () => {
    render(<StatusBadge tone="neutral" label="Custom" className="my-custom-class" />);
    const el = screen.getByText("Custom");
    expect(el.className).toMatch(/my-custom-class/);
    expect(el.className).toMatch(/bg-gray-100/);
  });

  it("forwards data-testid to the DOM element", () => {
    render(<StatusBadge tone="success" label="Online" data-testid="my-badge" />);
    expect(screen.getByTestId("my-badge")).toBeInTheDocument();
    expect(screen.getByTestId("my-badge").textContent).toBe("Online");
  });

  it("renders without className when not provided", () => {
    render(<StatusBadge tone="info" label="Info" />);
    const el = screen.getByText("Info");
    expect(el.className).not.toMatch(/undefined/);
  });

  it("includes the base pill classes on every tone", () => {
    render(<StatusBadge tone="warning" label="Warning pill" />);
    const el = screen.getByText("Warning pill");
    expect(el.className).toMatch(/inline-block/);
    expect(el.className).toMatch(/px-2/);
    expect(el.className).toMatch(/rounded/);
    expect(el.className).toMatch(/text-xs/);
    expect(el.className).toMatch(/font-medium/);
  });
});
