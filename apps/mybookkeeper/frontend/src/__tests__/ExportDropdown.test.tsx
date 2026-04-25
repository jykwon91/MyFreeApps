import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportDropdown from "@/app/features/transactions/ExportDropdown";

function renderDropdown(overrides?: { onExportCSV?: () => Promise<void>; onExportPDF?: () => Promise<void> }) {
  const onExportCSV = overrides?.onExportCSV ?? vi.fn().mockResolvedValue(undefined);
  const onExportPDF = overrides?.onExportPDF ?? vi.fn().mockResolvedValue(undefined);
  const result = render(<ExportDropdown onExportCSV={onExportCSV} onExportPDF={onExportPDF} />);
  return { ...result, onExportCSV, onExportPDF };
}

describe("ExportDropdown", () => {
  it("renders the Export trigger button", () => {
    renderDropdown();
    expect(screen.getByText("Export")).toBeInTheDocument();
  });

  it("does not show export options before clicking", () => {
    renderDropdown();
    expect(screen.queryByText("Export CSV")).not.toBeInTheDocument();
    expect(screen.queryByText("Export PDF")).not.toBeInTheDocument();
  });

  it("shows Export CSV and Export PDF options after clicking trigger", async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByText("Export"));

    expect(screen.getByText("Export CSV")).toBeInTheDocument();
    expect(screen.getByText("Export PDF")).toBeInTheDocument();
  });

  it("calls onExportCSV when Export CSV is clicked", async () => {
    const user = userEvent.setup();
    const { onExportCSV } = renderDropdown();

    await user.click(screen.getByText("Export"));
    await user.click(screen.getByText("Export CSV"));

    expect(onExportCSV).toHaveBeenCalledTimes(1);
  });

  it("calls onExportPDF when Export PDF is clicked", async () => {
    const user = userEvent.setup();
    const { onExportPDF } = renderDropdown();

    await user.click(screen.getByText("Export"));
    await user.click(screen.getByText("Export PDF"));

    expect(onExportPDF).toHaveBeenCalledTimes(1);
  });

  it("does not call onExportCSV when only the trigger is clicked", async () => {
    const user = userEvent.setup();
    const { onExportCSV } = renderDropdown();

    await user.click(screen.getByText("Export"));

    expect(onExportCSV).not.toHaveBeenCalled();
  });
});
