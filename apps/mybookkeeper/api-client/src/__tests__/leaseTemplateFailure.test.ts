import { describe, expect, it } from "vitest";
import { leaseTemplateDetail, leaseTemplateFailure } from "../utils/leaseTemplateFailure";
import { leaseTemplateUploadProblems } from "../utils/leaseTemplateUploadForm";

const refused = (status: number, detail?: unknown) => ({ status, data: { detail } });

describe("leaseTemplateFailure", () => {
  it.each([
    [undefined, "noResponse"],
    [400, "rejected"],
    [403, "viewOnly"],
    [404, "gone"],
    [413, "tooBigTogether"],
    [415, "badType"],
    [422, "invalid"],
    [503, "storage"],
    [500, "serverError"],
    [502, "serverError"],
    [418, "other"],
  ])("reads status %s as %s", (status, expected) => {
    expect(leaseTemplateFailure(status === undefined ? new Error("Network Error") : refused(status))).toBe(expected);
  });

  it("tells a 413 that names the file from one the proxy sent with no message", () => {
    expect(leaseTemplateFailure(refused(413, "lease.docx exceeds 25MB limit"))).toBe("tooBig");
    expect(leaseTemplateFailure({ status: 413, data: "<html>Request Entity Too Large</html>" })).toBe("tooBigTogether");
    expect(leaseTemplateFailure({ status: 413, data: "" })).toBe("tooBigTogether");
  });

  it("calls a 409 'in use' only when the server says so with its code", () => {
    expect(leaseTemplateFailure(refused(409, { code: "template_in_use", message: "Cannot delete" }))).toBe("inUse");
    expect(leaseTemplateFailure(refused(409, "Stale"))).toBe("conflict");
    expect(leaseTemplateFailure(refused(409))).toBe("conflict");
  });

  it("passes on the server's sentence only when it is plain text", () => {
    expect(leaseTemplateDetail(refused(413, "lease.docx exceeds 25MB limit"))).toBe("lease.docx exceeds 25MB limit");
    expect(leaseTemplateDetail(refused(422, [{ msg: "Field required" }]))).toBeNull();
    expect(leaseTemplateDetail(refused(409, { code: "template_in_use" }))).toBeNull();
    expect(leaseTemplateDetail(refused(400, "  "))).toBeNull();
    expect(leaseTemplateDetail(new Error("Network Error"))).toBeNull();
  });
});

const file = (name: string, size?: number) => ({ name, size });
/** The server counts its per-file limit in MiB; Caddy counts the request ceiling in decimal MB. */
const MIB = 1024 * 1024;
const MB = 1000 * 1000;

describe("leaseTemplateUploadProblems", () => {
  it("wants a name and at least one file", () => {
    expect(leaseTemplateUploadProblems("", [])).toEqual({ name: "name_required", files: "files_required" });
    expect(leaseTemplateUploadProblems("   ", [file("a.md", 1)])).toEqual({ name: "name_required" });
    expect(leaseTemplateUploadProblems("Standard", [])).toEqual({ files: "files_required" });
    expect(leaseTemplateUploadProblems("Standard", [file("a.md", 1), file("b.DOCX", 1)])).toEqual({});
  });

  it("keeps the name inside its column", () => {
    expect(leaseTemplateUploadProblems("x".repeat(200), [file("a.md", 1)])).toEqual({});
    expect(leaseTemplateUploadProblems("x".repeat(201), [file("a.md", 1)])).toEqual({ name: "name_too_long" });
  });

  it("refuses a file of a type the server won't take", () => {
    expect(leaseTemplateUploadProblems("T", [file("lease.pdf", 1)])).toEqual({ files: "file_type_unsupported" });
  });

  it("refuses a file over the server's 25 MB, and lets exactly 25 MB through", () => {
    expect(leaseTemplateUploadProblems("T", [file("a.docx", 25 * MIB)])).toEqual({});
    expect(leaseTemplateUploadProblems("T", [file("a.docx", 25 * MIB + 1)])).toEqual({ files: "file_too_big" });
  });

  it("refuses files that fit one by one but not through the proxy together", () => {
    expect(leaseTemplateUploadProblems("T", [file("a.docx", 20 * MB), file("b.docx", 20 * MB)])).toEqual({ files: "files_too_big_together" });
    expect(leaseTemplateUploadProblems("T", [file("a.docx", 20 * MB), file("b.docx", 9 * MB)])).toEqual({});
    expect(leaseTemplateUploadProblems("T", [file("a.docx", 20 * MB), file("b.docx", 9 * MB + 1)])).toEqual({ files: "files_too_big_together" });
  });

  it("counts the proxy ceiling in decimal MB, so 29 MiB together is turned away before Caddy's bodyless 413", () => {
    expect(leaseTemplateUploadProblems("T", [file("a.docx", 20 * MIB), file("b.docx", 9 * MIB)])).toEqual({ files: "files_too_big_together" });
  });

  it("leaves a file whose size isn't known to the server", () => {
    expect(leaseTemplateUploadProblems("T", [file("a.docx"), { name: "b.md", size: null }])).toEqual({});
  });
});
