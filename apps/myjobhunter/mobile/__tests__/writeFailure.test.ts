import { APPLICATION_DETAIL_MESSAGES } from "../src/constants/applicationDetail";
import { WRITE_FAILURE_MESSAGES } from "../src/constants/writeFailure";
import { createFailure, moveFailure, writeFailure } from "../src/lib/writeFailure";

const COPY = { failed: "I couldn't add that contact. Want to try again?", checkWhere: "this application's contacts" };

describe("writeFailure, for a change or delete", () => {
  it.each([{ status: undefined, data: "Network Error" }, { status: "FETCH_ERROR" }, { status: "TIMEOUT_ERROR" }])(
    "says the server can't be reached when no answer came back (%j)",
    (error) => {
      expect(writeFailure(error, "failed")).toBe(WRITE_FAILURE_MESSAGES.offline);
    },
  );

  it("says the thing is gone on a 404, and offers a retry otherwise", () => {
    expect(writeFailure({ status: 404, data: { detail: "Not Found" } }, "failed")).toBe(APPLICATION_DETAIL_MESSAGES.gone);
    expect(writeFailure({ status: 500, data: "Internal Server Error" }, "failed")).toBe("failed");
    expect(writeFailure({ status: 422, data: { detail: "nope" } }, "failed")).toBe("failed");
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

  it("offers a plain retry when the server refused it, which it does before saving", () => {
    expect(createFailure({ status: 422, data: { detail: "nope" } }, COPY)).toBe(COPY.failed);
    expect(createFailure({ status: 400, data: { detail: "nope" } }, COPY)).toBe(COPY.failed);
    expect(createFailure({ status: 503, data: { detail: "Storage unavailable" } }, COPY)).toBe(COPY.failed);
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

  it("offers a retry when the server refused the move, and says it's gone on a 404", () => {
    expect(moveFailure({ status: 400, data: { detail: "not allowed" } })).toBe(APPLICATION_DETAIL_MESSAGES.couldntMove);
    expect(moveFailure({ status: 404, data: { detail: "Not Found" } })).toBe(APPLICATION_DETAIL_MESSAGES.gone);
  });
});
