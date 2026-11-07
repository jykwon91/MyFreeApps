import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DocumentStatusBadge from "@/app/features/documents/StatusBadge";

describe("DocumentStatusBadge", () => {
  it.each([
    ["processing", "Extracting"],
    ["extracting", "Extracting"],
    ["failed", "Failed"],
    ["duplicate", "Duplicate"],
    ["skipped", "Read"],
    ["deleted", "Deleted"],
  ] as const)("labels a %s document %s", (status, label) => {
    render(<DocumentStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("marks a completed document with a check", () => {
    render(<DocumentStatusBadge status="completed" />);
    expect(screen.getByTitle("Completed")).toBeInTheDocument();
  });

  it("shows why extraction failed when the server says", () => {
    render(<DocumentStatusBadge status="failed" errorMessage="Couldn't open the PDF" />);
    expect(screen.getByTitle("Couldn't open the PDF")).toBeInTheDocument();
  });
});
