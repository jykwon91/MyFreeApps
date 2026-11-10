import { describe, expect, it } from "vitest";
import { fillDocumentUploadForm } from "../utils/fillDocumentUploadForm";

function makeFile(): File {
  return new File(["resume body"], "resume.pdf", { type: "application/pdf" });
}

describe("fillDocumentUploadForm", () => {
  it("sends the title, kind, application and file", () => {
    const form = new FormData();
    fillDocumentUploadForm(form, { title: "Tailored resume", kind: "tailored_resume", application_id: "app-1", file: makeFile() });

    expect([...form.keys()]).toEqual(["title", "kind", "application_id", "file"]);
    expect(form.get("title")).toBe("Tailored resume");
    expect(form.get("kind")).toBe("tailored_resume");
    expect(form.get("application_id")).toBe("app-1");
  });

  it("leaves application_id out when there is no application", () => {
    const form = new FormData();
    fillDocumentUploadForm(form, { title: "Cover letter", kind: "cover_letter", application_id: null, file: makeFile() });

    expect(form.has("application_id")).toBe(false);
    expect([...form.keys()]).toEqual(["title", "kind", "file"]);
  });

  it("appends the caller's file part as given", () => {
    const appended: [string, unknown][] = [];
    const part = { uri: "file:///resume.pdf", name: "resume.pdf", type: "application/pdf" };
    fillDocumentUploadForm({ append: (name: string, value: unknown) => appended.push([name, value]) }, { title: "t", kind: "cover_letter", application_id: null, file: part });

    expect(appended[appended.length - 1]).toEqual(["file", part]);
    expect(appended[appended.length - 1][1]).toBe(part);
  });
});
