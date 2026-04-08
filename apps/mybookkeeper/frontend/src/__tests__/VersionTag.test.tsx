import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import VersionTag from "@/app/components/VersionTag";

const mockUseGetVersionQuery = vi.fn();

vi.mock("@/shared/store/versionApi", () => ({
  useGetVersionQuery: (...args: unknown[]) => mockUseGetVersionQuery(...args),
}));

describe("VersionTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the commit hash when data is available", () => {
    mockUseGetVersionQuery.mockReturnValue({
      data: { commit: "d8ae75e", timestamp: "2026-04-02T00:00:00+00:00" },
      isLoading: false,
    });

    render(<VersionTag />);

    expect(screen.getByTestId("version-tag")).toBeInTheDocument();
    expect(screen.getByText("v.d8ae75e")).toBeInTheDocument();
  });

  it("renders nothing when data is loading", () => {
    mockUseGetVersionQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = render(<VersionTag />);

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when commit is unknown", () => {
    mockUseGetVersionQuery.mockReturnValue({
      data: { commit: "unknown", timestamp: "2026-04-02T00:00:00+00:00" },
      isLoading: false,
    });

    const { container } = render(<VersionTag />);

    expect(container.innerHTML).toBe("");
  });

  it("applies muted styling to the version text", () => {
    mockUseGetVersionQuery.mockReturnValue({
      data: { commit: "abc1234", timestamp: "2026-04-02T00:00:00+00:00" },
      isLoading: false,
    });

    render(<VersionTag />);

    const span = screen.getByText("v.abc1234");
    expect(span.className).toContain("text-muted-foreground");
    expect(span.className).toContain("text-[10px]");
  });

  it("makes the version text selectable", () => {
    mockUseGetVersionQuery.mockReturnValue({
      data: { commit: "abc1234", timestamp: "2026-04-02T00:00:00+00:00" },
      isLoading: false,
    });

    render(<VersionTag />);

    const span = screen.getByText("v.abc1234");
    expect(span.className).toContain("select-all");
  });
});
