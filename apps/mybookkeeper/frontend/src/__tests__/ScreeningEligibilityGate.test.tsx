import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScreeningEligibilityGate from "@/app/features/screening/ScreeningEligibilityGate";
import type { ScreeningEligibilityResponse } from "@/shared/types/screening/screening-eligibility-response";

function makeEligibility(overrides: Partial<ScreeningEligibilityResponse> = {}): ScreeningEligibilityResponse {
  return {
    eligible: false,
    missing_fields: [],
    has_pending: false,
    ...overrides,
  };
}

describe("ScreeningEligibilityGate", () => {
  it("renders the gate container", () => {
    render(<ScreeningEligibilityGate eligibility={makeEligibility()} />);
    expect(screen.getByTestId("screening-eligibility-gate")).toBeInTheDocument();
  });

  it("shows the explanatory heading", () => {
    render(<ScreeningEligibilityGate eligibility={makeEligibility()} />);
    expect(screen.getByText(/I need a bit more info before I can start screening/i)).toBeInTheDocument();
  });

  it("renders each missing field as a list item", () => {
    render(
      <ScreeningEligibilityGate
        eligibility={makeEligibility({
          missing_fields: ["Legal name", "Email or phone (from the linked inquiry)"],
        })}
      />,
    );
    expect(screen.getByText(/Legal name/i)).toBeInTheDocument();
    expect(screen.getByText(/Email or phone/i)).toBeInTheDocument();
  });

  it("renders nothing in the list when no fields are missing", () => {
    render(<ScreeningEligibilityGate eligibility={makeEligibility({ missing_fields: [] })} />);
    // List items should not be present (no bullet points)
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the add-details prompt", () => {
    render(<ScreeningEligibilityGate eligibility={makeEligibility()} />);
    expect(screen.getByText(/Add the missing details/i)).toBeInTheDocument();
  });
});
