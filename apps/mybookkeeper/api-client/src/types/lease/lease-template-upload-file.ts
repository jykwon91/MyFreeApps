/** What the size and type checks need of a chosen file; ``size`` is absent when the picker didn't say. */
export interface LeaseTemplateUploadFile {
  name: string;
  size?: number | null;
}
