/**
 * Tests for GreenhouseConfigSection.
 *
 * Covers:
 * - board_token input renders with correct label
 * - excluded_keywords MultiChipInput renders
 * - Invalid token format shows error hint
 * - Valid token: no error hint shown
 * - onExcludedKeywordsChange callback fires when chips change
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GreenhouseConfigSection from "../GreenhouseConfigSection";

// ---------------------------------------------------------------------------
// Mock @platform/ui — we only need FormField + MultiChipInput stubs
// ---------------------------------------------------------------------------
vi.mock("@platform/ui", () => ({
  FormField: ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div>
      <label>{label}</label>
      {children}
    </div>
  ),
  MultiChipInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string[];
    onChange: (v: string[]) => void;
    ariaLabel?: string;
    placeholder?: string;
  }) => (
    <div
      data-testid="multi-chip-input"
      aria-label={ariaLabel}
      onClick={() => onChange([...value, "new-chip"])}
    >
      {value.map((v) => (
        <span key={v} data-testid={`chip-${v}`}>
          {v}
        </span>
      ))}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GreenhouseConfigSection — board_token field", () => {
  it("renders the board_token input with correct label", () => {
    render(
      <GreenhouseConfigSection
        boardToken=""
        onBoardTokenChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Greenhouse board token")).toBeInTheDocument();
  });

  it("shows validation error hint for invalid token", () => {
    render(
      <GreenhouseConfigSection
        boardToken="invalid/token"
        onBoardTokenChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Invalid token/i),
    ).toBeInTheDocument();
  });

  it("shows help text for valid token", () => {
    render(
      <GreenhouseConfigSection
        boardToken="stripe"
        onBoardTokenChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/boards\.greenhouse\.io/i)).toBeInTheDocument();
  });
});

describe("GreenhouseConfigSection — excluded_keywords field", () => {
  it("renders the excluded keywords MultiChipInput", () => {
    render(
      <GreenhouseConfigSection
        boardToken="stripe"
        onBoardTokenChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("multi-chip-input")).toBeInTheDocument();
  });

  it("renders existing excluded keyword chips", () => {
    render(
      <GreenhouseConfigSection
        boardToken="stripe"
        onBoardTokenChange={vi.fn()}
        excludedKeywords={["junior", "intern"]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("chip-junior")).toBeInTheDocument();
    expect(screen.getByTestId("chip-intern")).toBeInTheDocument();
  });

  it("calls onExcludedKeywordsChange when chip is added", async () => {
    const onChange = vi.fn();
    render(
      <GreenhouseConfigSection
        boardToken="stripe"
        onBoardTokenChange={vi.fn()}
        excludedKeywords={["junior"]}
        onExcludedKeywordsChange={onChange}
      />,
    );
    await userEvent.click(screen.getByTestId("multi-chip-input"));
    expect(onChange).toHaveBeenCalledWith(["junior", "new-chip"]);
  });

  it("renders the excluded keywords label", () => {
    render(
      <GreenhouseConfigSection
        boardToken="stripe"
        onBoardTokenChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Exclude keywords/i)).toBeInTheDocument();
  });
});
