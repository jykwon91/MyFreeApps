import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VerdictBanner from "../VerdictBanner";

describe("VerdictBanner", () => {
  it("renders the verdict label and summary", () => {
    render(
      <VerdictBanner
        verdict="strong_fit"
        summary="Skills, seniority, and salary all line up."
      />,
    );
    expect(screen.getByText("Strong fit")).toBeInTheDocument();
    expect(
      screen.getByText("Skills, seniority, and salary all line up."),
    ).toBeInTheDocument();
  });

  it.each([
    ["strong_fit", "Strong fit"],
    ["worth_considering", "Worth considering"],
    ["stretch", "Stretch"],
    ["mismatch", "Mismatch"],
  ] as const)("displays the correct label for %s", (verdict, expected) => {
    render(<VerdictBanner verdict={verdict} summary="x" />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("uses different border classes per verdict", () => {
    const { container: c1 } = render(
      <VerdictBanner verdict="strong_fit" summary="x" />,
    );
    const { container: c2 } = render(
      <VerdictBanner verdict="mismatch" summary="x" />,
    );
    const banner1 = c1.firstChild as HTMLElement;
    const banner2 = c2.firstChild as HTMLElement;
    expect(banner1.className).toContain("border-green-200");
    expect(banner2.className).toContain("border-red-200");
  });
});
