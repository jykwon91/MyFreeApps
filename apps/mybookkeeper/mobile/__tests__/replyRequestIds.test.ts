import { clearReplyRequestIds, replyRequestIds } from "../src/features/inquiries/replyRequestIds";
import { session } from "../src/lib/session";
import { fakeFiles, File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));

const SAVED = "doc:/reply-request-ids.json";
const signIn = (email: string) => jest.spyOn(session, "getState").mockReturnValue({ status: "signedIn", email } as never);

beforeEach(() => {
  resetFakeFiles();
  clearReplyRequestIds();
  signIn("me@example.com");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("replyRequestIds", () => {
  it("are saved for the signed-in account, apart from anyone else's", () => {
    replyRequestIds.set("i1:abc", "id-1");
    expect(new File(SAVED).textSync()).toContain("id-1");
    signIn("other@example.com");
    expect(replyRequestIds.get("i1:abc")).toBeNull();
    signIn("me@example.com");
    expect(replyRequestIds.get("i1:abc")).toBe("id-1");
  });

  it("keep nothing while signed out", () => {
    jest.mocked(session.getState).mockReturnValue({ status: "signedOut" } as never);
    replyRequestIds.set("i1:abc", "id-1");
    expect(fakeFiles()).toEqual([]);
  });

  it("come back from the saved file", () => {
    new File(SAVED).write(JSON.stringify({ owner: "me@example.com", ids: { "i1:abc": "id-1" } }));
    expect(replyRequestIds.get("i1:abc")).toBe("id-1");
  });

  it("ignore a file they can't read", () => {
    new File(SAVED).write("{not json");
    expect(replyRequestIds.get("i1:abc")).toBeNull();
  });

  it("still hold in memory, and say so, when the file can't be written", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(File.prototype, "write").mockImplementation(() => {
      throw new Error("disk");
    });
    replyRequestIds.set("i1:abc", "id-1");
    expect(replyRequestIds.get("i1:abc")).toBe("id-1");
    expect(warn).toHaveBeenCalled();
  });

  it("drop one inquiry's keys together, and only that inquiry's", () => {
    replyRequestIds.set("i1:abc", "id-1");
    replyRequestIds.set("i1:mightHaveSent", "true");
    replyRequestIds.set("i10:abc", "id-2");
    replyRequestIds.deleteStartingWith("i1:");
    expect(replyRequestIds.get("i1:abc")).toBeNull();
    expect(replyRequestIds.get("i1:mightHaveSent")).toBeNull();
    expect(replyRequestIds.get("i10:abc")).toBe("id-2");
    expect(new File(SAVED).textSync()).not.toContain("id-1");
  });

  it("go at sign-out", () => {
    replyRequestIds.set("i1:abc", "id-1");
    clearReplyRequestIds();
    expect(fakeFiles()).toEqual([]);
    expect(replyRequestIds.get("i1:abc")).toBeNull();
  });
});
