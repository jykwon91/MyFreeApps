import type { DocumentUploadProblem } from "@myjobhunter/api-client/types/document/document-upload-problem";

/** What both apps say about a chosen document for each problem `documentUploadProblem` can report. */
export const DOCUMENT_UPLOAD_PROBLEM_MESSAGES: Record<DocumentUploadProblem, string> = {
  type: "That type of file can't be uploaded. Choose a PDF, DOCX, or TXT file.",
  size: "That file is over 25 MB. Choose a smaller one.",
  empty: "That file is empty. Choose a file with something in it.",
};
