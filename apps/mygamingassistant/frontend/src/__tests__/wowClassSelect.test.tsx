import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClassSelect from "@/games/wow-forever/components/shared/ClassSelect";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { classIcon, iconUrl } from "@/games/wow-forever/lib/icons/wowIcons";

describe("ClassSelect", () => {
  it("lists every class and shows the picked class's in-game icon", () => {
    render(<ClassSelect value="mage" onChange={() => {}} />);
    expect(screen.getAllByRole("option")).toHaveLength(WOW_CLASSES.length);
    const mage = classIcon("mage");
    if (!mage) throw new Error("mage has an icon");
    expect(screen.getByTestId("game-icon")).toHaveAttribute("src", iconUrl(mage.fileDataId));
  });

  it("reports the class picked", () => {
    const onChange = vi.fn();
    render(<ClassSelect value="mage" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "warlock" } });
    expect(onChange).toHaveBeenCalledWith("warlock");
  });

  it("offers only the classes given", () => {
    render(<ClassSelect value="priest" onChange={() => {}} classes={WOW_CLASSES.filter((c) => c.id === "priest" || c.id === "mage")} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Mage", "Priest"]);
  });

  it("picks the extra option, with no class icon while it's chosen", () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const { rerender } = render(<ClassSelect value="mage" onChange={onChange} allOption={{ label: "All classes", onSelect }} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "all" } });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    rerender(<ClassSelect value={null} onChange={onChange} allOption={{ label: "All classes", onSelect }} />);
    expect(screen.getByRole("combobox")).toHaveValue("all");
    expect(screen.queryByTestId("game-icon")).toBeNull();
  });
});
