import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import TransparencyWidget from "../components/widgets/TransparencyWidget";
import {
  useTransparency,
  type TransparencyData,
  type TransparencyResult,
} from "../components/widgets/useTransparency";

vi.mock("../components/widgets/useTransparency", () => ({
  useTransparency: vi.fn(),
}));

const mocked = vi.mocked(useTransparency);

const CONFIGURED: TransparencyData = {
  month: "June 2026",
  costs_cents: 8200,
  donations_cents: 4700,
  updated_at: "2026-06-01T00:00:00Z",
  configured: true,
};

function ok(over: Partial<TransparencyData> = {}): TransparencyResult {
  return { status: "ok", data: { ...CONFIGURED, ...over } };
}

beforeEach(() => {
  mocked.mockReset();
});

describe("TransparencyWidget", () => {
  it("shows a skeleton (no live data) while loading", () => {
    mocked.mockReturnValue({ status: "loading" });
    render(<TransparencyWidget />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/running costs/i)).not.toBeInTheDocument();
  });

  it("shows a quiet message on error", () => {
    mocked.mockReturnValue({ status: "error" });
    render(<TransparencyWidget />);
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
  });

  it("renders nothing until costs are configured", () => {
    mocked.mockReturnValue(ok({ configured: false }));
    const { container } = render(<TransparencyWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it("invites the first donation when none received", () => {
    mocked.mockReturnValue(ok({ donations_cents: 0 }));
    render(<TransparencyWidget />);
    expect(screen.getByText(/be the first/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("shows the percentage covered for a partial month", () => {
    mocked.mockReturnValue(ok());
    render(<TransparencyWidget />);
    expect(screen.getByText(/57% of this month/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "57");
  });

  it("marks the goal met when donations cover costs", () => {
    mocked.mockReturnValue(ok({ donations_cents: 9000 }));
    render(<TransparencyWidget />);
    expect(screen.getByText("Goal met this month")).toBeInTheDocument();
    expect(screen.getByText(/thank you/i)).toBeInTheDocument();
  });

  it("formats the dollar figures from cents", () => {
    mocked.mockReturnValue(ok());
    render(<TransparencyWidget />);
    expect(screen.getByText("$47.00")).toBeInTheDocument();
    expect(screen.getByText("$82.00")).toBeInTheDocument();
  });
});
