import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TwoFactorStep from "../components/auth/TwoFactorStep";

function renderStep(onVerify = vi.fn().mockResolvedValue(true), onBack = vi.fn()) {
  render(<TwoFactorStep onVerify={onVerify} onBack={onBack} />);
  return { onVerify, onBack, user: userEvent.setup() };
}

describe("TwoFactorStep", () => {
  it("keeps Verify disabled until 6 characters, then sends the code", async () => {
    const { onVerify, user } = renderStep();
    const verify = screen.getByRole("button", { name: "Verify" });

    await user.type(screen.getByLabelText("Authentication code"), "12345");
    expect(verify).toBeDisabled();
    await user.type(screen.getByLabelText("Authentication code"), "6");
    expect(verify).toBeEnabled();
    await user.click(verify);

    expect(onVerify).toHaveBeenCalledWith("123456");
  });

  it("takes an 8-character recovery code, dropping separators and anything past 8", async () => {
    const { onVerify, user } = renderStep();

    await user.type(screen.getByLabelText("Authentication code"), "ab-cd ef-gh9");
    expect(screen.getByLabelText("Authentication code")).toHaveValue("abcdefgh");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(onVerify).toHaveBeenCalledWith("abcdefgh");
  });

  it("says the code didn't go through when the server still asks for one", async () => {
    const { user } = renderStep(vi.fn().mockResolvedValue(false));

    await user.type(screen.getByLabelText("Authentication code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Authentication code didn't go through. Please try again.",
    );
  });

  it("shows the server's reason when the code is refused", async () => {
    const refused = Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401, data: { detail: "invalid_totp" } },
    });
    const { user } = renderStep(vi.fn().mockRejectedValue(refused));

    await user.type(screen.getByLabelText("Authentication code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid authentication code. Please try again.",
    );
  });

  it("goes back to the sign-in form", async () => {
    const { onBack, user } = renderStep();

    await user.click(screen.getByRole("button", { name: "Back to login" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  describe("when the server says too many attempts", () => {
    const tooMany = Object.assign(new Error("Request failed with status code 429"), {
      response: { status: 429, data: { detail: "Too many attempts" } },
    });

    afterEach(() => vi.useRealTimers());

    async function hitLimit() {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onVerify = vi.fn().mockRejectedValueOnce(tooMany).mockResolvedValue(true);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<TwoFactorStep onVerify={onVerify} onBack={vi.fn()} />);
      await user.type(screen.getByLabelText("Authentication code"), "123456");
      await user.click(screen.getByRole("button", { name: "Verify" }));
      return { onVerify, user };
    }

    it("shows the lockout message and a Try again countdown on a disabled button", async () => {
      await hitLimit();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Too many sign-in attempts. Try again in a few minutes.",
      );
      expect(screen.getByRole("button", { name: "Try again in 30s" })).toBeDisabled();
    });

    it("counts down and turns back into Verify when the wait is over", async () => {
      const { onVerify } = await hitLimit();
      await screen.findByRole("button", { name: "Try again in 30s" });

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Try again in 25s" })).toBeDisabled();

      act(() => vi.advanceTimersByTime(25000));
      const verify = screen.getByRole("button", { name: "Verify" });
      expect(verify).toBeEnabled();
      expect(onVerify).toHaveBeenCalledTimes(1);
    });
  });
});
