/**
 * Tests for LiveOverridePanel — covers the PR 10 utility-override
 * dropdown interaction.
 *
 * The component pulls maps from `useGetMapsQuery`; we mock the entire
 * `gamesApi` slice so the panel renders without a real Redux store.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LiveOverridePanel from "@/components/live/LiveOverridePanel";
import type { Cs2UtilitySlug, GsiSide } from "@/types/desktop";

// Mock the gamesApi hook the panel calls.
vi.mock("@/store/gamesApi", () => ({
  useGetMapsQuery: () => ({
    data: [
      { slug: "mirage", name: "Mirage" },
      { slug: "dust2", name: "Dust II" },
      { slug: "inferno", name: "Inferno" },
    ],
    isLoading: false,
  }),
}));

interface OverrideState {
  enabled: boolean;
  mapSlug: string;
  side: GsiSide;
  utility: Cs2UtilitySlug | null;
}

const DEFAULT: OverrideState = {
  enabled: true,
  mapSlug: "mirage",
  side: "side_b",
  utility: null,
};

describe("LiveOverridePanel — visibility", () => {
  it("renders nothing when visible=false", () => {
    const { container } = render(
      <LiveOverridePanel
        visible={false}
        override={DEFAULT}
        onChange={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the region landmark when visible=true", () => {
    render(
      <LiveOverridePanel
        visible={true}
        override={DEFAULT}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("region", { name: /manual override/i }),
    ).toBeInTheDocument();
  });
});

describe("LiveOverridePanel — utility dropdown (PR 10)", () => {
  it("renders the utility dropdown with all 5 CS2 utility slugs + All", () => {
    render(
      <LiveOverridePanel
        visible={true}
        override={DEFAULT}
        onChange={() => undefined}
      />,
    );
    const select = screen.getByLabelText(/Override utility filter/i) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((o) => o.text);
    expect(optionTexts).toContain("All utility");
    expect(optionTexts).toContain("Smoke");
    expect(optionTexts).toContain("Flash");
    expect(optionTexts).toContain("Molotov");
    expect(optionTexts).toContain("HE");
    expect(optionTexts).toContain("Decoy");
  });

  it("defaults to 'All utility' when override.utility is null", () => {
    render(
      <LiveOverridePanel
        visible={true}
        override={{ ...DEFAULT, utility: null }}
        onChange={() => undefined}
      />,
    );
    const select = screen.getByLabelText(/Override utility filter/i) as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("propagates the chosen utility slug via onChange", () => {
    const onChange = vi.fn();
    render(
      <LiveOverridePanel
        visible={true}
        override={DEFAULT}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText(/Override utility filter/i);
    fireEvent.change(select, { target: { value: "smoke" } });
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT,
      utility: "smoke",
    });
  });

  it("resets utility to null when 'All utility' is selected", () => {
    const onChange = vi.fn();
    render(
      <LiveOverridePanel
        visible={true}
        override={{ ...DEFAULT, utility: "smoke" }}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText(/Override utility filter/i);
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT,
      utility: null,
    });
  });

  it("preserves mapSlug and side when changing utility", () => {
    const onChange = vi.fn();
    render(
      <LiveOverridePanel
        visible={true}
        override={{ enabled: true, mapSlug: "dust2", side: "side_a", utility: null }}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText(/Override utility filter/i);
    fireEvent.change(select, { target: { value: "flash" } });
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      mapSlug: "dust2",
      side: "side_a",
      utility: "flash",
    });
  });

  it("preserves utility when changing map", () => {
    const onChange = vi.fn();
    render(
      <LiveOverridePanel
        visible={true}
        override={{ enabled: true, mapSlug: "mirage", side: "side_b", utility: "smoke" }}
        onChange={onChange}
      />,
    );
    const mapSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(mapSelect, { target: { value: "dust2" } });
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      mapSlug: "dust2",
      side: "side_b",
      utility: "smoke",
    });
  });
});

describe("LiveOverridePanel — set/clear/set utility cycle", () => {
  it("preserves other override fields across multiple utility changes", () => {
    const calls: OverrideState[] = [];
    function record(next: OverrideState) {
      calls.push(next);
    }

    // 1st render — default state, set utility to smoke
    const initialOverride: OverrideState = {
      enabled: true,
      mapSlug: "mirage",
      side: "side_b",
      utility: null,
    };
    const { rerender } = render(
      <LiveOverridePanel
        visible={true}
        override={initialOverride}
        onChange={record}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Override utility filter/i), {
      target: { value: "smoke" },
    });

    // 2nd render — utility=smoke, clear it
    const afterSet = calls[calls.length - 1];
    rerender(
      <LiveOverridePanel
        visible={true}
        override={afterSet}
        onChange={record}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Override utility filter/i), {
      target: { value: "" },
    });

    // 3rd render — utility=null, set to flash
    const afterClear = calls[calls.length - 1];
    rerender(
      <LiveOverridePanel
        visible={true}
        override={afterClear}
        onChange={record}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Override utility filter/i), {
      target: { value: "flash" },
    });

    const final = calls[calls.length - 1];
    expect(final.utility).toBe("flash");
    expect(final.mapSlug).toBe("mirage");
    expect(final.side).toBe("side_b");
    expect(final.enabled).toBe(true);
  });
});
