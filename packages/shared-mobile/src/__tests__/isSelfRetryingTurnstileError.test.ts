import { isSelfRetryingTurnstileError } from "../utils/isSelfRetryingTurnstileError";

describe("isSelfRetryingTurnstileError", () => {
  it.each(["600010", "600000", "300030", "110600", "110620"])("says the widget gets past %s", (code) => {
    expect(isSelfRetryingTurnstileError(code)).toBe(true);
  });

  it.each(["110100", "110110", "110200", "200100", "200500", "400020", "400021", "400070", "script_load_failed", "unknown", "600", "3000301"])(
    "says the widget is stuck on %s",
    (code) => {
      expect(isSelfRetryingTurnstileError(code)).toBe(false);
    },
  );
});
