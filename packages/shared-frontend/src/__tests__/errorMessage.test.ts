import { describe, it, expect } from "vitest";
import { extractErrorMessage } from "../utils/errorMessage";

describe("extractErrorMessage", () => {
  it("returns the message of an Error instance", () => {
    expect(extractErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns a plain string as-is", () => {
    expect(extractErrorMessage("nope")).toBe("nope");
  });

  it("reads RTK-style data.detail string", () => {
    expect(
      extractErrorMessage({ data: { detail: "Source not found" } }),
    ).toBe("Source not found");
  });

  // The bug this fixes: FastAPI 422 returns detail as an array of
  // { type, loc, msg, input }. Rendering that array crashes React.
  it("flattens a FastAPI 422 detail array and prefixes the field", () => {
    const err = {
      data: {
        detail: [
          {
            type: "value_error",
            loc: ["body", "url"],
            msg: "youtube_playlist URL must be a YouTube playlist URL",
            input: "https://youtu.be/abc",
          },
        ],
      },
    };
    expect(extractErrorMessage(err)).toBe(
      "url: youtube_playlist URL must be a YouTube playlist URL",
    );
  });

  it("joins multiple validation errors with '; '", () => {
    const err = {
      data: {
        detail: [
          { loc: ["body", "url"], msg: "field required" },
          { loc: ["body", "kind"], msg: "kind must be youtube_playlist or youtube_channel" },
        ],
      },
    };
    expect(extractErrorMessage(err)).toBe(
      "url: field required; kind: kind must be youtube_playlist or youtube_channel",
    );
  });

  it("omits the field prefix when loc only contains 'body'", () => {
    expect(
      extractErrorMessage({ data: { detail: [{ loc: ["body"], msg: "invalid body" }] } }),
    ).toBe("invalid body");
  });

  it("handles a top-level detail array (non-RTK shape)", () => {
    expect(
      extractErrorMessage({ detail: [{ loc: ["body", "x"], msg: "bad" }] }),
    ).toBe("x: bad");
  });

  it("falls back when the array has no usable msg", () => {
    expect(
      extractErrorMessage({ data: { detail: [{ type: "x", loc: ["body"] }] } }),
    ).toBe("An unexpected error occurred");
  });

  it("falls back to a generic message for unknown shapes", () => {
    expect(extractErrorMessage(undefined)).toBe("An unexpected error occurred");
    expect(extractErrorMessage(null)).toBe("An unexpected error occurred");
    expect(extractErrorMessage({ weird: true })).toBe("An unexpected error occurred");
  });
});
