import { describe, it, expect } from "vitest";
import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormField from "../components/ui/FormField";

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => (
  <select ref={ref} {...props} />
));

describe("FormField", () => {
  it("links its label to the control, so clicking the label focuses it", async () => {
    render(<FormField label="Amount">{(field) => <input {...field} />}</FormField>);

    const input = screen.getByLabelText("Amount");
    expect(input.tagName).toBe("INPUT");
    await userEvent.click(screen.getByText("Amount"));
    expect(input).toHaveFocus();
  });

  it("names the field by its label alone, not the required, modified or highlight markers", () => {
    render(
      <FormField label="Amount" required dirty highlight>
        {(field) => <input {...field} />}
      </FormField>,
    );

    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).not.toHaveAttribute("required");
  });

  it("leaves aria-required off when the field isn't required", () => {
    render(<FormField label="Notes">{(field) => <textarea {...field} />}</FormField>);
    expect(screen.getByRole("textbox", { name: "Notes" })).not.toHaveAttribute("aria-required");
  });

  it("keeps a $ prefix and an error message out of the name", () => {
    render(
      <FormField label="Amount">
        {(field) => (
          <>
            <div className="relative">
              <span>$</span>
              <input {...field} />
            </div>
            <p>Enter an amount</p>
          </>
        )}
      </FormField>,
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });

  it("gives each field in a list its own id", async () => {
    render(
      <>
        {["Name", "Price"].map((label) => (
          <FormField key={label} label={label}>
            {(field) => <input {...field} />}
          </FormField>
        ))}
      </>,
    );

    const name = screen.getByRole("textbox", { name: "Name" });
    const price = screen.getByRole("textbox", { name: "Price" });
    expect(name.id).not.toBe(price.id);
    await userEvent.click(screen.getByText("Price"));
    expect(price).toHaveFocus();
  });

  it("links a forwardRef select", () => {
    render(
      <FormField label="Category">
        {(field) => (
          <Select {...field}>
            <option>Repairs</option>
          </Select>
        )}
      </FormField>,
    );
    expect(screen.getByRole("combobox", { name: "Category" })).toBeInTheDocument();
  });

  it("group mode names a cluster of buttons, and says when it's required", () => {
    render(
      <FormField label="Classification" required group>
        <button type="button">Investment</button>
        <button type="button">Personal</button>
      </FormField>,
    );

    const group = screen.getByRole("group", { name: "Classification (required)" });
    expect(group).toContainElement(screen.getByRole("button", { name: "Investment" }));
    expect(group).toContainElement(screen.getByRole("button", { name: "Personal" }));
  });

  it("group mode around a labelled checkbox doesn't give it two names", () => {
    render(
      <FormField label="Tax Relevant" group>
        <label>
          <input type="checkbox" /> Include in tax reports
        </label>
      </FormField>,
    );

    expect(screen.getByRole("group", { name: "Tax Relevant" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include in tax reports" })).toBeInTheDocument();
  });

  it("requires a choice between one control and a group", () => {
    // @ts-expect-error a single control is passed as a function, so plain children need `group`
    const missingGroup = <FormField label="Amount"><input /></FormField>;
    // @ts-expect-error a group takes plain children, not a function
    const groupWithFunction = <FormField label="Tiles" group>{() => <input />}</FormField>;
    expect([missingGroup, groupWithFunction]).toHaveLength(2);
  });
});
