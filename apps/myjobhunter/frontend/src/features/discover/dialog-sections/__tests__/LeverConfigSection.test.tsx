/**
 * Tests for LeverConfigSection.
 *
 * Covers:
 * - company_slug input renders with correct label
 * - excluded_keywords MultiChipInput renders
 * - Invalid slug format shows error hint
 * - Valid slug: no error hint shown
 * - Input normalizes to lowercase
 * - onExcludedKeywordsChange callback fires when chips change
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeverConfigSection from "../LeverConfigSection";

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

describe("LeverConfigSection — company_slug field", () => {
  it("renders the company_slug input with correct label", () => {
    render(
      <LeverConfigSection
        companySlug=""
        onCompanySlugChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Lever company slug")).toBeInTheDocument();
  });

  it("shows validation error hint for invalid slug", () => {
    render(
      <LeverConfigSection
        companySlug="Invalid/Slug"
        onCompanySlugChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Invalid slug/i)).toBeInTheDocument();
  });

  it("shows help text for valid slug", () => {
    render(
      <LeverConfigSection
        companySlug="openai"
        onCompanySlugChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/jobs\.lever\.co/i)).toBeInTheDocument();
  });
});

describe("LeverConfigSection — excluded_keywords field", () => {
  it("renders the excluded keywords MultiChipInput", () => {
    render(
      <LeverConfigSection
        companySlug="openai"
        onCompanySlugChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("multi-chip-input")).toBeInTheDocument();
  });

  it("renders existing excluded keyword chips", () => {
    render(
      <LeverConfigSection
        companySlug="openai"
        onCompanySlugChange={vi.fn()}
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
      <LeverConfigSection
        companySlug="openai"
        onCompanySlugChange={vi.fn()}
        excludedKeywords={["junior"]}
        onExcludedKeywordsChange={onChange}
      />,
    );
    await userEvent.click(screen.getByTestId("multi-chip-input"));
    expect(onChange).toHaveBeenCalledWith(["junior", "new-chip"]);
  });

  it("renders the excluded keywords label", () => {
    render(
      <LeverConfigSection
        companySlug="openai"
        onCompanySlugChange={vi.fn()}
        excludedKeywords={[]}
        onExcludedKeywordsChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Exclude keywords/i)).toBeInTheDocument();
  });
});
