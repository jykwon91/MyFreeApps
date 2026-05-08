import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MultiChipInput from "../components/ui/MultiChipInput";

describe("MultiChipInput", () => {
  it("renders existing chips and allows removing one via X button", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={["Python", "Go"]} onChange={onChange} />);
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Go")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Remove Python"));
    expect(onChange).toHaveBeenCalledWith(["Go"]);
  });

  it("shows placeholder when empty and hides it after typing a chip", async () => {
    const onChange = vi.fn();
    render(
      <MultiChipInput
        value={[]}
        onChange={onChange}
        placeholder="Add a tag"
      />,
    );
    expect(screen.getByPlaceholderText("Add a tag")).toBeInTheDocument();

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "React{Enter}");
    expect(onChange).toHaveBeenCalledWith(["React"]);
  });

  it("hides placeholder when chips are present and focuses input on container click", async () => {
    render(
      <MultiChipInput
        value={["Python"]}
        onChange={() => {}}
        placeholder="Add a tag"
      />,
    );
    expect(screen.queryByPlaceholderText("Add a tag")).toBeNull();
    const container = screen.getByRole("textbox").parentElement!;
    await userEvent.click(container);
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("adds a chip on Enter key", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={[]} onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "React{Enter}");
    expect(onChange).toHaveBeenCalledWith(["React"]);
  });

  it("adds a chip on comma key", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={[]} onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "FastAPI,");
    expect(onChange).toHaveBeenCalledWith(["FastAPI"]);
  });

  it("does not add duplicate chips", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={["Python"]} onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "Python{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes last chip on Backspace when input is empty", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={["Python", "Go"]} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["Python"]);
  });

  it("renders remove buttons for each chip and calls onChange when clicked", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={["Python", "Go"]} onChange={onChange} />);
    expect(screen.getByLabelText("Remove Python")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Go")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Remove Go"));
    expect(onChange).toHaveBeenCalledWith(["Python"]);
  });

  it("renders only non-selected suggestions and adds one on click", async () => {
    const onChange = vi.fn();
    render(
      <MultiChipInput
        value={["Python"]}
        onChange={onChange}
        suggestions={["Python", "Go", "Rust"]}
      />,
    );
    expect(screen.queryByRole("button", { name: "+ Python" })).toBeNull();
    expect(screen.getByRole("button", { name: "+ Go" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Rust" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Go" }));
    expect(onChange).toHaveBeenCalledWith(["Python", "Go"]);
  });

  it("commits draft value on blur", () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "TypeScript" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(["TypeScript"]);
  });
});
