import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RowPrimaryAction from "../components/data/RowPrimaryAction";

describe("RowPrimaryAction", () => {
  it("renders a button that activates once and keeps the click from reaching the row", async () => {
    const onActivate = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <RowPrimaryAction onActivate={onActivate} aria-label="Open invoice.pdf">
          invoice.pdf
        </RowPrimaryAction>
      </div>,
    );
    const button = screen.getByRole("button", { name: "Open invoice.pdf" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();

    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("renders a link that navigates and keeps the click from reaching the row", async () => {
    const onRowClick = vi.fn();
    render(
      <MemoryRouter initialEntries={["/vendors"]}>
        <Routes>
          <Route
            path="/vendors"
            element={
              <div onClick={onRowClick}>
                <RowPrimaryAction to="/vendors/v1">Acme Plumbing</RowPrimaryAction>
              </div>
            }
          />
          <Route path="/vendors/v1" element={<p>Vendor page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Acme Plumbing" });
    expect(link).toHaveAttribute("href", "/vendors/v1");
    await userEvent.click(link);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByText("Vendor page")).toBeInTheDocument();
  });
});
