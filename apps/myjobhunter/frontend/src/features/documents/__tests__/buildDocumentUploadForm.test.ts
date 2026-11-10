import { describe, expect, it } from "vitest";
import { buildDocumentUploadForm } from "@/features/documents/buildDocumentUploadForm";

function makeFile(): File {
  return new File(["resume body"], "resume.pdf", { type: "application/pdf" });
}

describe("buildDocumentUploadForm", () => {
  it("sends the title, kind, application and file", () => {
    const file = makeFile();
    const form = buildDocumentUploadForm({
      title: "Tailored resume",
      kind: "tailored_resume",
      application_id: "app-1",
      file,
    });

    expect([...form.keys()]).toEqual(["title", "kind", "application_id", "file"]);
    expect(form.get("title")).toBe("Tailored resume");
    expect(form.get("kind")).toBe("tailored_resume");
    expect(form.get("application_id")).toBe("app-1");
  });

  it("leaves application_id out when there is no application", () => {
    const form = buildDocumentUploadForm({
      title: "Cover letter",
      kind: "cover_letter",
      application_id: null,
      file: makeFile(),
    });

    expect(form.has("application_id")).toBe(false);
    expect([...form.keys()]).toEqual(["title", "kind", "file"]);
  });

  it("appends the caller's File itself, not a copy", () => {
    const file = makeFile();
    const form = buildDocumentUploadForm({ title: "t", kind: "cover_letter", application_id: null, file });

    expect(form.get("file")).toBe(file);
  });
});
