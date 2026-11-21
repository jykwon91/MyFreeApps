import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoadingRegion from "../components/ui/LoadingRegion";
import LoadingStatus from "../components/ui/LoadingStatus";
import Skeleton from "../components/ui/Skeleton";

describe("LoadingRegion", () => {
  it("announces the label once as a polite status", () => {
    render(
      <LoadingRegion label="Loading transactions…">
        <Skeleton />
        <Skeleton />
      </LoadingRegion>,
    );

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("Loading transactions…");
  });

  it("marks the region busy and passes other attributes through", () => {
    render(
      <LoadingRegion label="Loading" data-testid="region" className="space-y-3">
        <Skeleton />
      </LoadingRegion>,
    );

    const region = screen.getByTestId("region");
    expect(region.children).toHaveLength(1);
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveClass("space-y-3");
    expect(region).toHaveAccessibleName("Loading");
  });

  it("hides the skeleton blocks from assistive tech", () => {
    render(
      <LoadingRegion label="Loading">
        <Skeleton testId="block" />
      </LoadingRegion>,
    );

    expect(screen.getByTestId("block")).toHaveAttribute("aria-hidden", "true");
  });

  it("announces only once when regions are nested", () => {
    render(
      <LoadingRegion label="Loading dashboard…">
        <LoadingRegion label="Loading card…" data-testid="inner">
          <Skeleton />
        </LoadingRegion>
      </LoadingRegion>,
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
    expect(screen.getByTestId("inner")).toHaveAttribute("aria-busy", "true");
  });
});

describe("LoadingStatus", () => {
  it("announces its label on its own", () => {
    render(<LoadingStatus label="Loading the order…" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading the order…");
  });
});
