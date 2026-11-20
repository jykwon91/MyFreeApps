import { describe, expect, it } from "vitest";
import { GMAIL_CONNECT_FAILURES } from "../constants/gmailConnect";
import { gmailConnectRefusalReason, readGmailConnectReturn } from "../utils/gmailConnectReturn";

const read = (query: string) => readGmailConnectReturn(new URLSearchParams(query));

describe("readGmailConnectReturn", () => {
  it("hands back Google's code and the state to finish with", () => {
    expect(read("code=c0de&state=signed.jwt")).toEqual({ kind: "authorized", code: "c0de", state: "signed.jwt" });
  });

  it.each(GMAIL_CONNECT_FAILURES.map((reason) => [reason]))("reads the reason %s", (reason) => {
    expect(read(`result=error&reason=${reason}`)).toEqual({ kind: "failed", reason });
  });

  it.each([
    ["a reason it doesn't know", "result=error&reason=<script>"],
    ["an answer it doesn't know", "result=connected"],
    ["a code without its state", "code=c0de"],
    ["a state without its code", "state=signed"],
    ["nothing at all", ""],
  ])("treats %s as a plain failure", (_name, query) => {
    expect(read(query)).toEqual({ kind: "failed", reason: "failed" });
  });
});

describe("gmailConnectRefusalReason", () => {
  it("reads the server's reason", () => {
    expect(gmailConnectRefusalReason({ status: 403, data: { detail: "wrong_account" } })).toBe("wrong_account");
  });

  it.each([
    ["a detail it doesn't know", { status: 400, data: { detail: "Invalid OAuth state" } }],
    ["no answer", { status: "FETCH_ERROR" }],
    ["nothing", undefined],
  ])("treats %s as failed", (_name, error) => {
    expect(gmailConnectRefusalReason(error)).toBe("failed");
  });
});
