/**
 * The company picker is a WAI-ARIA editable combobox with a listbox popup: the input names the
 * popup and the highlighted row, and the keyboard flow still picks or creates a company.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Company } from "@myjobhunter/api-client/types/company";
import CompanyCombobox from "../CompanyCombobox";

function company(id: string, name: string): Company {
  return { id, name, primary_domain: `${name.toLowerCase()}.com`, logo_url: null } as Company;
}

const COMPANIES = [company("c1", "Acme"), company("c2", "Acorn")];

function setup(props: Partial<React.ComponentProps<typeof CompanyCombobox>> = {}) {
  const onSelect = vi.fn();
  const onCreate = vi.fn();
  render(<CompanyCombobox companies={COMPANIES} onSelect={onSelect} onCreate={onCreate} {...props} />);
  return { onSelect, onCreate, input: screen.getByRole("combobox", { name: "Company name" }) };
}

describe("CompanyCombobox ARIA", () => {
  it("is a collapsed list-autocomplete combobox when there is nothing to show", () => {
    const { input } = setup({ companies: [] });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("expands and controls the listbox once matches show", async () => {
    const { input } = setup();
    await userEvent.type(input, "ac");
    const listbox = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(listbox.id).not.toBe("");
    const options = screen.getAllByRole("option");
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
    options.forEach((o) => expect(o).toHaveAttribute("aria-selected", "false"));
  });

  it("points aria-activedescendant at the highlighted option as arrows move", async () => {
    const { input } = setup();
    await userEvent.type(input, "ac");
    await userEvent.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("marks the add row disabled while a create is in flight", async () => {
    const { input } = setup({ isCreating: true });
    await userEvent.type(input, "Zed");
    expect(screen.getByRole("option", { name: /add zed/i })).toHaveAttribute("aria-disabled", "true");
  });

  it("names the input from the labelling element when one is given", () => {
    render(
      <>
        <span id="lbl">Employer</span>
        <CompanyCombobox companies={COMPANIES} onSelect={vi.fn()} onCreate={vi.fn()} labelledBy="lbl" />
      </>,
    );
    expect(screen.getByRole("combobox", { name: "Employer" })).toBeInTheDocument();
  });
});

describe("CompanyCombobox keyboard", () => {
  it("selects the highlighted company on Enter", async () => {
    const { input, onSelect } = setup();
    await userEvent.type(input, "ac");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("c2", "Acorn");
  });

  it("wraps with ArrowUp from no highlight to the last row", async () => {
    const { input } = setup();
    await userEvent.type(input, "ac");
    await userEvent.keyboard("{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", options[options.length - 1].id);
  });

  it("creates a new company on Enter when the typed name matches nothing", async () => {
    const { input, onCreate } = setup();
    await userEvent.type(input, "Zed{Enter}");
    expect(onCreate).toHaveBeenCalledWith("Zed");
  });

  it("selects by mouse and clears on Escape", async () => {
    const { input, onSelect } = setup();
    await userEvent.type(input, "ac");
    await userEvent.click(screen.getByRole("option", { name: /acme/i }));
    expect(onSelect).toHaveBeenCalledWith("c1", "Acme");
    await userEvent.type(input, "{Escape}");
    expect(input).toHaveValue("");
  });
});
