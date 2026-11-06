/** The two story fields a write needs: which story, and the `updated_at` it was read at (`If-Match`). */
export interface TriageStoryVersion {
  id: string;
  updated_at: string;
}
