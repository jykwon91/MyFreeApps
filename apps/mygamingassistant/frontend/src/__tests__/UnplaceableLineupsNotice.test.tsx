/**
 * UnplaceableLineupsNotice — the non-blocking MapPage hint shown when every
 * lineup for the current filter lacks a resolvable map position (Task 7).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UnplaceableLineupsNotice from "@/components/lineup/UnplaceableLineupsNotice";

describe("UnplaceableLineupsNotice", () => {
  it("renders a status role so it is announced but non-blocking", () => {
    render(<UnplaceableLineupsNotice count={3} />);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("pluralizes the count for multiple lineups", () => {
    render(<UnplaceableLineupsNotice count={3} />);
    expect(
      screen.getByText(/3 lineups can't be shown on the map yet/i),
    ).toBeDefined();
  });

  it("uses the singular form for a single lineup", () => {
    render(<UnplaceableLineupsNotice count={1} />);
    expect(
      screen.getByText(/1 lineup can't be shown on the map yet/i),
    ).toBeDefined();
    expect(screen.queryByText(/1 lineups/i)).toBeNull();
  });

  it("points the operator at calibration (Review / zone editor)", () => {
    render(<UnplaceableLineupsNotice count={2} />);
    expect(screen.getByText(/need calibration/i)).toBeDefined();
    expect(screen.getByText(/Review or the\s+zone editor/i)).toBeDefined();
  });
});
