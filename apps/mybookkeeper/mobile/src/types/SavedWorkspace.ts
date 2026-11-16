import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";

/**
 * The workspace this person last had open on this phone. The name is for saying it's gone, or which one
 * is open while offline. The role is what the server last said it was; null when saved before roles were.
 */
export interface SavedWorkspace {
  id: string;
  name: string;
  role: OrgRole | null;
}
