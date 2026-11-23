import { APPLICATION_DETAIL_MESSAGES } from "../src/constants/applicationDetail";
import { WRITE_FAILURE_MESSAGES } from "../src/constants/writeFailure";
import { createFailure, moveFailure, readFailure, writeFailure } from "../src/lib/writeFailure";

const COPY = { failed: "I couldn't add that contact. Want to try again?", checkWhere: "this application's contacts" };

const UNSURE = "I didn't get an answer, so I'm not sure that went through. Trying again is safe.";

describe("writeFailure, for a change or delete", () => {
  it.each([
    { status: undefined, data: "Network Error" },
    { status: "FETCH_ERROR" },
    { status: "TIMEOUT_ERROR" },
    { status: 500, data: "Internal Server Error" },
    { status: 502, data: "<html>Bad Gateway</html>" },
  ])("doesn't call it a failure when the answer was lost (%j): it may have gone through, and trying again is safe", (error) => {
    expect(writeFailure(error, "failed")).toBe(UNSURE);
  });

  it("says the thing is gone on a 404, and the server's reason on a 4xx refusal, never a 5xx's words", () => {
    expect(writeFailure({ status: 404, data: { detail: "Not Found" } }, "failed")).toBe(APPLICATION_DETAIL_MESSAGES.gone);
    expect(writeFailure({ status: 422, data: { detail: "nope" } }, "failed")).toBe("nope");
    expect(writeFailure({ status: 503, data: { detail: "Storage unavailable" } }, "failed")).toBe("failed");
  });

  it.each([
    ["no detail", { status: 422, data: {} }],
    ["a detail that isn't text", { status: 422, data: { detail: [{ msg: "bad" }] } }],
    ["a page instead of JSON", { status: 400, data: "<html>Bad Request</html>" }],
  ])("offers the plain retry when a refusal comes with %s", (_, error) => {
    expect(writeFailure(error, "failed")).toBe("failed");
  });

  it("says nothing when signing out called it off", () => {
    expect(writeFailure({ name: "AbortError", message: "Aborted" }, "failed")).toBeNull();
  });
});

describe("readFailure, for opening something", () => {
  it("says the server can't be reached when no answer came back, since nothing changed", () => {
    expect(readFailure({ status: "FETCH_ERROR" }, "failed")).toBe(WRITE_FAILURE_MESSAGES.offline);
    expect(readFailure({ status: 404, data: { detail: "Not Found" } }, "failed")).toBe(APPLICATION_DETAIL_MESSAGES.gone);
    expect(readFailure({ status: 500, data: "Internal Server Error" }, "failed")).toBe("failed");
  });
});

describe("createFailure, for an add", () => {
  it.each([
    ["no answer came back", { status: undefined, data: "Network Error" }],
    ["it timed out", { status: undefined, data: "timeout of 30000ms exceeded" }],
  ])("says it lost the connection and to check first when %s", (_, error) => {
    expect(createFailure(error, COPY)).toBe(
      "I lost the connection, so I'm not sure that saved. Check this application's contacts before trying again, so you don't end up with two.",
    );
  });

  it.each([
    ["the server broke", { status: 500, data: "Internal Server Error" }],
    ["the proxy failed", { status: 502, data: "<html>Bad Gateway</html>" }],
  ])("says to check first when %s without a reason, since it may have saved", (_, error) => {
    expect(createFailure(error, COPY)).toBe(
      "I'm not sure that saved. Check this application's contacts before trying again, so you don't end up with two.",
    );
  });

  it("says the server's reason when it refused the add (never a 5xx's words), which it does before saving", () => {
    expect(createFailure({ status: 422, data: { detail: "nope" } }, COPY)).toBe("nope");
    expect(createFailure({ status: 400, data: { detail: "nope" } }, COPY)).toBe("nope");
    expect(createFailure({ status: 503, data: { detail: "Storage unavailable" } }, COPY)).toBe(COPY.failed);
  });

  it.each([
    ["no detail", { status: 422, data: {} }],
    ["a detail that isn't text", { status: 422, data: { detail: [{ msg: "bad" }] } }],
    ["a page instead of JSON", { status: 400, data: "<html>Bad Request</html>" }],
  ])("offers the plain retry when a refusal comes with %s", (_, error) => {
    expect(createFailure(error, COPY)).toBe(COPY.failed);
  });

  it("says the parent is gone on a 404 only when given the words for it", () => {
    expect(createFailure({ status: 404, data: { detail: "Not Found" } }, COPY)).toBe(COPY.failed);
    expect(createFailure({ status: 404, data: { detail: "Not Found" } }, { ...COPY, gone: APPLICATION_DETAIL_MESSAGES.gone })).toBe(APPLICATION_DETAIL_MESSAGES.gone);
  });
});

describe("moveFailure, for moving an application to another stage", () => {
  it.each([
    ["no answer came back", { status: undefined, data: "Network Error" }],
    ["the server broke without a reason", { status: 502, data: "<html>Bad Gateway</html>" }],
  ])("says it's unsure the move happened when %s", (_, error) => {
    expect(moveFailure(error)).toBe(APPLICATION_DETAIL_MESSAGES.unsureMoved);
  });

  it("says the server's reason when it refused the move, the plain retry without one, and that it's gone on a 404", () => {
    expect(moveFailure({ status: 400, data: { detail: "not allowed" } })).toBe("not allowed");
    expect(moveFailure({ status: 400, data: {} })).toBe(APPLICATION_DETAIL_MESSAGES.couldntMove);
    expect(moveFailure({ status: 404, data: { detail: "Not Found" } })).toBe(APPLICATION_DETAIL_MESSAGES.gone);
  });
});

describe("a write a cache reset called off", () => {
  // What RTK Query rejects with when signing out or changing account aborts the request.
  const aborted = { name: "AbortError", message: "Aborted" };

  it("has nothing to say, for a change, an add or a move", () => {
    expect(writeFailure(aborted, "failed")).toBeNull();
    expect(createFailure(aborted, COPY)).toBeNull();
    expect(moveFailure(aborted)).toBeNull();
  });
});
