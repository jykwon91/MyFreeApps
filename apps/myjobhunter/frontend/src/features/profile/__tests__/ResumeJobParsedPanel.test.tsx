import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ResumeJobParsedFields } from "@myjobhunter/api-client/types/resume-upload-job/resume-job-parsed-fields";
import ResumeJobParsedPanel from "@/features/profile/ResumeJobParsedPanel";

const PARSED: ResumeJobParsedFields = {
  headline: "Senior Software Engineer",
  summary: "Builds payment systems.",
  work_history_count: 1,
  education_count: 2,
  skills_count: 12,
};

describe("ResumeJobParsedPanel", () => {
  it("shows the headline, summary and counts with matching nouns", () => {
    const { container } = render(<ResumeJobParsedPanel parsed={PARSED} />);
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Builds payment systems.")).toBeInTheDocument();
    expect(container).toHaveTextContent("1 role");
    expect(container).toHaveTextContent("2 education entries");
    expect(container).toHaveTextContent("12 skills");
  });

  it("warns about each flagged line, naming where it came from", () => {
    render(
      <ResumeJobParsedPanel
        parsed={{
          ...PARSED,
          provenance: {
            checked: true,
            flagged: [
              { kind: "work_bullet", company: "Acme", text: "Grew revenue 300%", unsourced_terms: ["300%"] },
              { kind: "summary", text: "Led 40 engineers", unsourced_terms: ["40"] },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText(/2 items contain figures or names not found in your uploaded resume/)).toBeInTheDocument();
    expect(screen.getByText(/in Acme/)).toBeInTheDocument();
    expect(screen.getByText(/in the summary/)).toBeInTheDocument();
  });

  it("shows no warning when nothing was flagged or the parse wasn't checked", () => {
    const { rerender } = render(<ResumeJobParsedPanel parsed={{ ...PARSED, provenance: { checked: true, flagged: [] } }} />);
    expect(screen.queryByText(/not found in your uploaded resume/)).not.toBeInTheDocument();
    rerender(<ResumeJobParsedPanel parsed={{ ...PARSED, provenance: null }} />);
    expect(screen.queryByText(/not found in your uploaded resume/)).not.toBeInTheDocument();
  });
});
