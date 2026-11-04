import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SensitiveDataUnlock, {
  type SensitiveDataUnlockProps,
} from "@/app/features/applicants/SensitiveDataUnlock";

function renderUnlock(props: Partial<SensitiveDataUnlockProps> = {}) {
  const onHide = vi.fn();
  const onShow = vi.fn();
  render(
    <SensitiveDataUnlock isRevealed={false} onHide={onHide} onShow={onShow} {...props}>
      <span>secret value</span>
    </SensitiveDataUnlock>,
  );
  return { onHide, onShow };
}

describe("SensitiveDataUnlock", () => {
  it("hides its children until revealed", () => {
    renderUnlock();
    expect(screen.getByTestId("sensitive-data-hidden")).toBeInTheDocument();
    expect(screen.queryByText("secret value")).not.toBeInTheDocument();
    expect(screen.getByTestId("sensitive-data-toggle")).toHaveAttribute("aria-pressed", "false");
  });

  it("asks for the data when pressed", async () => {
    const { onShow, onHide } = renderUnlock();
    await userEvent.click(screen.getByTestId("sensitive-data-toggle"));
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onHide).not.toHaveBeenCalled();
  });

  it("shows its children once revealed and hides when pressed", async () => {
    const { onHide, onShow } = renderUnlock({ isRevealed: true });
    expect(screen.getByText("secret value")).toBeInTheDocument();
    expect(screen.queryByTestId("sensitive-data-hidden")).not.toBeInTheDocument();
    expect(screen.getByTestId("sensitive-data-toggle")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByTestId("sensitive-data-toggle"));
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onShow).not.toHaveBeenCalled();
  });

  it("can't be pressed twice while loading", async () => {
    const { onShow } = renderUnlock({ isLoading: true });
    const toggle = screen.getByTestId("sensitive-data-toggle");
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveTextContent("Loading...");
    await userEvent.click(toggle);
    expect(onShow).not.toHaveBeenCalled();
  });

  it("explains a failure and keeps the data hidden", () => {
    renderUnlock({ errorMessage: "I couldn't load those details." });
    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load those details.");
    expect(screen.getByTestId("sensitive-data-hidden")).toBeInTheDocument();
  });

  it("supports custom labels", () => {
    renderUnlock({ showLabel: "Reveal" });
    expect(screen.getByTestId("sensitive-data-toggle")).toHaveTextContent("Reveal");
    expect(screen.getByTestId("sensitive-data-hidden")).toHaveTextContent('click "Reveal"');
  });
});
