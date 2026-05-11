/**
 * Unit tests for ProfileCompletenessBanner.
 *
 * Uses the exported `ProfileCompletenessBannerContent` (pure presentational
 * component) for most tests so they don't need to manage localStorage state.
 * Container-level tests use `ProfileCompletenessBanner` directly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProfileCompletenessBanner, {
  ProfileCompletenessBannerContent,
} from "../ProfileCompletenessBanner";

const STORAGE_KEY = "mjh_discover_profile_banner_dismissed";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
}));

function renderInRouter(ui: React.ReactElement) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MemoryRouter>{ui as any}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// Presentational content
// ---------------------------------------------------------------------------

describe("ProfileCompletenessBannerContent", () => {
  it("renders the heading, body, and CTA link", () => {
    renderInRouter(<ProfileCompletenessBannerContent onDismiss={vi.fn()} />);
    expect(
      screen.getByText("Add your resume to see match scores"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Without a resume or skills/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set up profile/i })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("calls onDismiss when the X button is clicked", async () => {
    const onDismiss = vi.fn();
    renderInRouter(<ProfileCompletenessBannerContent onDismiss={onDismiss} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Dismiss this banner/i }),
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Container — visibility logic
// ---------------------------------------------------------------------------

describe("ProfileCompletenessBanner (container)", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("renders when both hasResume and hasSkills are false", () => {
    renderInRouter(
      <ProfileCompletenessBanner hasResume={false} hasSkills={false} />,
    );
    expect(screen.getByTestId("profile-completeness-banner")).toBeInTheDocument();
  });

  it("does not render when hasResume is true (profile complete enough)", () => {
    renderInRouter(
      <ProfileCompletenessBanner hasResume={true} hasSkills={false} />,
    );
    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();
  });

  it("does not render when hasSkills is true (profile complete enough)", () => {
    renderInRouter(
      <ProfileCompletenessBanner hasResume={false} hasSkills={true} />,
    );
    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();
  });

  it("does not render when localStorage flag is set", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    renderInRouter(
      <ProfileCompletenessBanner hasResume={false} hasSkills={false} />,
    );
    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();
  });

  it("hides after clicking dismiss and persists to localStorage", async () => {
    renderInRouter(
      <ProfileCompletenessBanner hasResume={false} hasSkills={false} />,
    );
    expect(screen.getByTestId("profile-completeness-banner")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Dismiss this banner/i }),
    );

    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });
});
