/**
 * PinEditPanel tests — empty/progress state, selected-lineup editing surface,
 * Save vs Save & Next wiring, and the in-flight (saving) disabled state.
 *
 * The panel is driven entirely by a usePinEditor-shaped `editor` prop, so
 * these tests build a stub editor and assert on how the panel renders and
 * routes clicks — no store or router needed.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PinEditPanel from "@/components/lineup/PinEditPanel";
import type { PinEditor } from "@/hooks/usePinEditor";
import type { Lineup } from "@/types/game";

/** Minimal lineup — PinEditPanel/MinimapPinEditor only read these fields. */
function fakeLineup(): Lineup {
  return {
    id: "l1",
    title: "Sova A-site dart",
    effective_stand_x: 0.4,
    effective_stand_y: 0.4,
    effective_target_x: 0.6,
    effective_target_y: 0.6,
    stand_anchor_x: null,
    stand_anchor_y: null,
    target_anchor_x: null,
    target_anchor_y: null,
  } as unknown as Lineup;
}

function makeEditor(overrides: Partial<PinEditor> = {}): PinEditor {
  return {
    selectedLineupId: null,
    selectedLineup: null,
    standAnchorX: "",
    standAnchorY: "",
    targetAnchorX: "",
    targetAnchorY: "",
    onStandChange: vi.fn(),
    onTargetChange: vi.fn(),
    onResetStand: vi.fn(),
    onResetTarget: vi.fn(),
    save: vi.fn(),
    isSaving: false,
    setSelected: vi.fn(),
    hasNext: false,
    confirmedCount: 0,
    totalCount: 0,
    ...overrides,
  } as PinEditor;
}

describe("PinEditPanel", () => {
  it("shows the placeholder and progress count when nothing is selected", () => {
    render(
      <PinEditPanel
        editor={makeEditor({ confirmedCount: 12, totalCount: 40 })}
        minimapUrl={null}
      />,
    );
    expect(screen.getByText(/click a pin to nudge/i)).toBeDefined();
    expect(screen.getByText(/12 of 40 placed/i)).toBeDefined();
  });

  it("renders the editor and both actions when a lineup is selected", () => {
    render(
      <PinEditPanel
        editor={makeEditor({ selectedLineup: fakeLineup() })}
        minimapUrl="https://example.test/minimap.png"
      />,
    );
    expect(screen.getByText(/sova a-site dart/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /save & next/i })).toBeDefined();
  });

  it("wires Save to save(false) and Save & Next to save(true)", async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    render(
      <PinEditPanel
        editor={makeEditor({ selectedLineup: fakeLineup(), hasNext: true, save })}
        minimapUrl={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(save).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("button", { name: /save & next/i }));
    expect(save).toHaveBeenCalledWith(true);
  });

  it("disables Save & Next when there is no next unplaced lineup", () => {
    render(
      <PinEditPanel
        editor={makeEditor({ selectedLineup: fakeLineup(), hasNext: false })}
        minimapUrl={null}
      />,
    );
    expect(screen.getByRole("button", { name: /save & next/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows a saving state and disables actions while a save is in flight", () => {
    render(
      <PinEditPanel
        editor={makeEditor({ selectedLineup: fakeLineup(), hasNext: true, isSaving: true })}
        minimapUrl={null}
      />,
    );
    // Both buttons collapse to the "Saving…" label and disable.
    const saving = screen.getAllByRole("button", { name: /saving/i });
    expect(saving.length).toBeGreaterThanOrEqual(1);
    saving.forEach((b) => expect(b).toHaveProperty("disabled", true));
  });
});
