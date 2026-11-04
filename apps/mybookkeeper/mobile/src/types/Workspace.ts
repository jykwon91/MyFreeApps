export interface Workspace {
  id: string;
  name: string;
  org_role: "owner" | "admin" | "user" | "viewer";
}
