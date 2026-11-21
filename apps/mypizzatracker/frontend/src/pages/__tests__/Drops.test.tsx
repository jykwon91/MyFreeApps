import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DropsPage from "../Drops";

vi.mock("@/store/dropsApi", () => ({
  useListDropsQuery: () => ({ currentData: [], isError: false, error: undefined, refetch: vi.fn() }),
}));

vi.mock("@/features/drops/CreateDropCard", () => ({ default: () => null }));
vi.mock("@/features/drops/DropCard", () => ({ default: () => null }));
vi.mock("@/features/drops/DropsListSkeleton", () => ({ default: () => null }));

describe("Drops page", () => {
  it("ties the Filter label to the status picker", () => {
    render(<DropsPage />);
    expect(screen.getByLabelText("Filter:")).toBe(screen.getByRole("combobox"));
  });
});
