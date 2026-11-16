/** Choosing a resume file and uploading it, as one tap. */
export interface ResumeUploadControls {
  /** Opens the picker, checks the file, uploads it. Never rejects: every failure is a toast. */
  upload: () => Promise<void>;
  /** From the tap until the upload settles. One guard for every upload button, whichever is on screen. */
  isUploading: boolean;
  /** The id of the last upload this screen sent, so it can be picked once it's read. */
  uploadedId: string | null;
  /** The name of a file that never reached the server (no connection), kept so it can be sent again without picking it again. */
  unsentName: string | null;
  /** Sends the kept file again. */
  retry: () => Promise<void>;
  /** Lets go of the kept file. */
  discardUnsent: () => void;
}
