import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ApplicantStageBadge from "@/app/features/applicants/ApplicantStageBadge";
import {
  APPLICANT_STAGES,
  APPLICANT_STAGE_LABELS,
} from "@/shared/lib/applicant-labels";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

describe("ApplicantStageBadge", () => {
  it.each(APPLICANT_STAGES)("renders the label for stage '%s'", (stage) => {
    const { unmount } = render(<ApplicantStageBadge stage={stage as ApplicantStage} />);
    expect(screen.getByTestId(`applicant-stage-badge-${stage}`)).toBeInTheDocument();
    expect(screen.getByText(APPLICANT_STAGE_LABELS[stage])).toBeInTheDocument();
    unmount();
  });

  it("applies green styling for the 'approved' stage (positive outcome)", () => {
    render(<ApplicantStageBadge stage="approved" />);
    const badge = screen.getByTestId("applicant-stage-badge-approved");
    expect(badge.className).toMatch(/bg-green-100/);
  });

  it("applies red styling for the 'declined' stage (negative outcome)", () => {
    render(<ApplicantStageBadge stage="declined" />);
    const badge = screen.getByTestId("applicant-stage-badge-declined");
    expect(badge.className).toMatch(/bg-red-100/);
  });

  it("applies yellow styling for the 'screening_pending' stage (in-flight)", () => {
    render(<ApplicantStageBadge stage="screening_pending" />);
    const badge = screen.getByTestId("applicant-stage-badge-screening_pending");
    expect(badge.className).toMatch(/bg-yellow-100/);
  });

  it("applies gray styling for the 'lead' stage (early funnel)", () => {
    render(<ApplicantStageBadge stage="lead" />);
    const badge = screen.getByTestId("applicant-stage-badge-lead");
    expect(badge.className).toMatch(/bg-gray-100/);
  });

  it("merges custom className", () => {
    render(<ApplicantStageBadge stage="lead" className="my-custom-class" />);
    const badge = screen.getByTestId("applicant-stage-badge-lead");
    expect(badge.className).toMatch(/my-custom-class/);
  });
});
