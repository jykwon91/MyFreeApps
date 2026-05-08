import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MultiChipInput from "../components/ui/MultiChipInput";

describe("MultiChipInput", () => {
  it("renders existing chips from value prop", () => {
    render(
      <MultiChipInput value={["Python", "Go"]} onChange={() => {}} />,
    );
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("renders placeholder when value is empty", () => {
    render(
      <MultiChipInput
        value={[]}
        onChange={() => {}}
        placeholder="Add a tag"
      />,
    );
    expect(screen.getByPlaceholderText("Add a tag")).toBeInTheDocument();
  });

  it("hides placeholder when chips are present", () => {
    render(
      <MultiChipInput
        value={["Python"]}
        onChange={() => {}}
        placeholder="Add a tag"
      />,
    );
    expect(screen.queryByPlaceholderText("Add a tag")).toBeNull();
  });

  it("calls onChange with new chip on Enter", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "React{Enter}");
    expect(onChange).toHaveBeenCalledWith(["React"]);
  });

  it("calls onChange with new chip on comma", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "FastAPI,");
    expect(onChange).toHaveBeenCalledWith(["FastAPI"]);
  });

  it("does not add duplicate chips", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={["Python"]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Python{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes last chip on Backspace when input is empty", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={["Python", "Go"]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["Python"]);
  });

  it("renders a remove button for each chip", () => {
    render(
      <MultiChipInput value={["Python", "Go"]} onChange={() => {}} />,
    );
    expect(screen.getByLabelText("Remove Python")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Go")).toBeInTheDocument();
  });

  it("calls onChange without the chip when remove is clicked", async () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={["Python", "Go"]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Remove Python"));
    expect(onChange).toHaveBeenCalledWith(["Go"]);
  });

  it("renders available suggestions that are not already in value", () => {
    render(
      <MultiChipInput
        value={["Python"]}
        onChange={() => {}}
        suggestions={["Python", "Go", "Rust"]}
      />,
    );
    expect(screen.queryByRole("button", { name: "+ Python" })).toBeNull();
    expect(screen.getByRole("button", { name: "+ Go" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Rust" })).toBeInTheDocument();
  });

  it("calls onChange when a suggestion chip is clicked", async () => {
    const onChange = vi.fn();
    render(
      <MultiChipInput
        value={[]}
        onChange={onChange}
        suggestions={["Go"]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "+ Go" }));
    expect(onChange).toHaveBeenCalledWith(["Go"]);
  });

  it("commits draft on blur", () => {
    const onChange = vi.fn();
    render(<MultiChipInput value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "TypeScript" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(["TypeScript"]);
  });
});
