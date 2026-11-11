import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VerdictBanner from "../VerdictBanner";
import type { JobAnalysisVerdict } from "@myjobhunter/api-client/types/job-analysis/job-analysis-verdict";

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

  it("says only Analyzed, in the default tone as before, for a verdict added on the backend after this build", () => {
    render(
      <VerdictBanner
        verdict={"surprising_fit" as JobAnalysisVerdict}
        summary="New rubric."
      />,
    );
    expect(screen.getByText("Analyzed")).toBeInTheDocument();
    expect(screen.queryByText("surprising_fit")).not.toBeInTheDocument();
    expect(screen.getByRole("status").className).toContain("border-blue-200");
  });
});
